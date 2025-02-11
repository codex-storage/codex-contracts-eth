// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Accounts.sol";
import "./Locks.sol";

/// Records account balances and token flows. Accounts are separated into funds.
/// Funds are kept separate between controllers.
///
/// A fund can only be manipulated by a controller when it is locked. Tokens can
/// only be withdrawn when a fund is unlocked.
///
/// The vault maintains a number of invariants to ensure its integrity.
///
/// The lock invariant ensures that there is a maximum time that a fund can be
/// locked:
///
/// (∀ controller ∈ Controller, fund ∈ Fund:
///   lock.expiry <= lock.maximum
///   where lock = _locks[controller][fund])
///
/// The account invariant ensures that the outgoing token flow can be sustained
/// for the maximum time that a fund can be locked:
///
/// (∀ controller ∈ Controller, fund ∈ Fund, recipient ∈ Recipient:
///   account.isSolventAt(lock.maximum)
///   where account = _accounts[controller][fund][recipient]
///   and lock = _locks[controller][fund])
///
/// The flow invariant ensures that incoming and outgoing flow rates match:
///
/// (∀ controller ∈ Controller, fund ∈ Fund:
///   (∑ recipient ∈ Recipient: accounts[recipient].flow.incoming) =
///   (∑ recipient ∈ Recipient: accounts[recipient].flow.outgoing)
///   where accounts = _accounts[controller][fund])
///
abstract contract VaultBase {
  using SafeERC20 for IERC20;
  using Accounts for Account;
  using Locks for Lock;

  IERC20 internal immutable _token;

  /// Represents a smart contract that can redistribute and burn tokens in funds
  type Controller is address;
  /// Unique identifier for a fund, chosen by the controller
  type Fund is bytes32;
  /// Receives the balance of an account when withdrawing
  type Recipient is address;

  /// Each fund has its own time lock
  mapping(Controller => mapping(Fund => Lock)) private _locks;
  /// Each recipient has its own account in a fund
  mapping(Controller => mapping(Fund => mapping(Recipient => Account)))
    private _accounts;

  constructor(IERC20 token) {
    _token = token;
  }

  function _getLockStatus(
    Controller controller,
    Fund fund
  ) internal view returns (LockStatus) {
    return _locks[controller][fund].status();
  }

  function _getLockExpiry(
    Controller controller,
    Fund fund
  ) internal view returns (Timestamp) {
    return _locks[controller][fund].expiry;
  }

  function _getBalance(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal view returns (Balance memory) {
    Lock memory lock = _locks[controller][fund];
    LockStatus lockStatus = lock.status();
    if (lockStatus == LockStatus.Locked) {
      Account memory account = _accounts[controller][fund][recipient];
      account.update(Timestamps.currentTime());
      return account.balance;
    }
    if (lockStatus == LockStatus.Unlocked) {
      Account memory account = _accounts[controller][fund][recipient];
      account.update(lock.expiry);
      return account.balance;
    }
    return Balance({available: 0, designated: 0});
  }

  function _lock(
    Controller controller,
    Fund fund,
    Timestamp expiry,
    Timestamp maximum
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.NoLock, VaultFundAlreadyLocked());
    lock.expiry = expiry;
    lock.maximum = maximum;
    _checkLockInvariant(lock);
    _locks[controller][fund] = lock;
  }

  function _extendLock(
    Controller controller,
    Fund fund,
    Timestamp expiry
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());
    require(lock.expiry <= expiry, VaultInvalidExpiry());
    lock.expiry = expiry;
    _checkLockInvariant(lock);
    _locks[controller][fund] = lock;
  }

  function _deposit(
    Controller controller,
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) internal {
    Lock storage lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account storage account = _accounts[controller][fund][recipient];

    account.balance.available += amount;
    lock.value += amount;

    _token.safeTransferFrom(
      Controller.unwrap(controller),
      address(this),
      amount
    );
  }

  function _designate(
    Controller controller,
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account memory account = _accounts[controller][fund][recipient];
    require(amount <= account.balance.available, VaultInsufficientBalance());

    account.balance.available -= amount;
    account.balance.designated += amount;
    _checkAccountInvariant(account, lock);

    _accounts[controller][fund][recipient] = account;
  }

  function _transfer(
    Controller controller,
    Fund fund,
    Recipient from,
    Recipient to,
    uint128 amount
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account memory sender = _accounts[controller][fund][from];
    require(amount <= sender.balance.available, VaultInsufficientBalance());

    sender.balance.available -= amount;
    _checkAccountInvariant(sender, lock);

    _accounts[controller][fund][from] = sender;

    _accounts[controller][fund][to].balance.available += amount;
  }

  function _flow(
    Controller controller,
    Fund fund,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account memory sender = _accounts[controller][fund][from];
    sender.flowOut(rate);
    _checkAccountInvariant(sender, lock);
    _accounts[controller][fund][from] = sender;

    Account memory receiver = _accounts[controller][fund][to];
    receiver.flowIn(rate);
    _accounts[controller][fund][to] = receiver;
  }

  function _burnDesignated(
    Controller controller,
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account storage account = _accounts[controller][fund][recipient];
    require(account.balance.designated >= amount, VaultInsufficientBalance());

    account.balance.designated -= amount;

    _token.safeTransfer(address(0xdead), amount);
  }

  function _burnAccount(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal {
    Lock storage lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account memory account = _accounts[controller][fund][recipient];
    require(account.flow.incoming == account.flow.outgoing, VaultFlowNotZero());
    uint128 amount = account.balance.available + account.balance.designated;

    lock.value -= amount;

    delete _accounts[controller][fund][recipient];

    _token.safeTransfer(address(0xdead), amount);
  }

  function _burnFund(Controller controller, Fund fund) internal {
    Lock storage lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    lock.burned = true;

    _token.safeTransfer(address(0xdead), lock.value);
  }

  function _withdraw(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Unlocked, VaultFundNotUnlocked());

    Account memory account = _accounts[controller][fund][recipient];
    account.update(lock.expiry);
    uint128 amount = account.balance.available + account.balance.designated;

    lock.value -= amount;

    if (lock.value == 0) {
      delete _locks[controller][fund];
    } else {
      _locks[controller][fund] = lock;
    }

    delete _accounts[controller][fund][recipient];

    _token.safeTransfer(Recipient.unwrap(recipient), amount);
  }

  function _checkLockInvariant(Lock memory lock) private pure {
    require(lock.expiry <= lock.maximum, VaultInvalidExpiry());
  }

  function _checkAccountInvariant(
    Account memory account,
    Lock memory lock
  ) private pure {
    require(account.isSolventAt(lock.maximum), VaultInsufficientBalance());
  }

  error VaultInsufficientBalance();
  error VaultInvalidExpiry();
  error VaultFundNotLocked();
  error VaultFundNotUnlocked();
  error VaultFundAlreadyLocked();
  error VaultFlowNotZero();
}
