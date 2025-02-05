// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Accounts.sol";
import "./Timestamps.sol";
import "./TokenFlows.sol";
import "./Locks.sol";

using SafeERC20 for IERC20;
using Timestamps for Timestamp;
using Accounts for Account;
using Locks for Lock;

abstract contract VaultBase {
  IERC20 internal immutable _token;

  type Controller is address;
  type Fund is bytes32;
  type Recipient is address;

  mapping(Controller => mapping(Fund => Lock)) private _locks;
  mapping(Controller => mapping(Fund => mapping(Recipient => Account)))
    private _accounts;

  constructor(IERC20 token) {
    _token = token;
  }

  function _getLock(
    Controller controller,
    Fund fund
  ) internal view returns (Lock memory) {
    return _locks[controller][fund];
  }

  function _getAccount(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal view returns (Account memory) {
    Account memory account = _accounts[controller][fund][recipient];
    Lock memory lock = _locks[controller][fund];
    Timestamp timestamp = Timestamps.earliest(
      Timestamps.currentTime(),
      lock.expiry
    );
    account.update(timestamp);
    return account;
  }

  function _lock(
    Controller controller,
    Fund fund,
    Timestamp expiry,
    Timestamp maximum
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.maximum == Timestamp.wrap(0), AlreadyLocked());
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
    require(lock.isLocked(), LockRequired());
    require(lock.expiry <= expiry, InvalidExpiry());
    lock.expiry = expiry;
    _checkLockInvariant(lock);
    _locks[controller][fund] = lock;
  }

  function _deposit(
    Controller controller,
    Fund fund,
    address from,
    uint128 amount
  ) internal {
    Lock storage lock = _locks[controller][fund];
    require(lock.isLocked(), LockRequired());

    Recipient recipient = Recipient.wrap(from);
    Account storage account = _accounts[controller][fund][recipient];

    account.balance.available += amount;
    lock.value += amount;

    _token.safeTransferFrom(from, address(this), amount);
  }

  function _designate(
    Controller controller,
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.isLocked(), LockRequired());

    Account memory account = _accounts[controller][fund][recipient];

    require(amount <= account.balance.available, InsufficientBalance());
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
    require(lock.isLocked(), LockRequired());

    Account memory sender = _getAccount(controller, fund, from);
    require(amount <= sender.balance.available, InsufficientBalance());
    sender.balance.available -= amount;
    _checkAccountInvariant(sender, lock);
    _accounts[controller][fund][from] = sender;

    Account memory receiver = _getAccount(controller, fund, to);
    receiver.balance.available += amount;
    _accounts[controller][fund][to] = receiver;
  }

  function _flow(
    Controller controller,
    Fund fund,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.isLocked(), LockRequired());

    Account memory sender = _accounts[controller][fund][from];
    sender.flowOut(rate);
    _checkAccountInvariant(sender, lock);
    _accounts[controller][fund][from] = sender;

    Account memory receiver = _accounts[controller][fund][to];
    receiver.flowIn(rate);
    _accounts[controller][fund][to] = receiver;
  }

  function _burn(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal {
    Lock storage lock = _locks[controller][fund];
    require(lock.isLocked(), LockRequired());

    Account memory account = _getAccount(controller, fund, recipient);
    require(
      account.flow.incoming == account.flow.outgoing,
      CannotBurnFlowingTokens()
    );

    uint128 amount = account.balance.available + account.balance.designated;

    lock.value -= amount;

    delete _accounts[controller][fund][recipient];

    _token.safeTransfer(address(0xdead), amount);
  }

  function _withdraw(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(!lock.isLocked(), Locked());

    Account memory account = _getAccount(controller, fund, recipient);
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
    require(lock.expiry <= lock.maximum, ExpiryPastMaximum());
  }

  function _checkAccountInvariant(
    Account memory account,
    Lock memory lock
  ) private pure {
    require(account.isSolventAt(lock.maximum), InsufficientBalance());
  }

  error InsufficientBalance();
  error Locked();
  error AlreadyLocked();
  error ExpiryPastMaximum();
  error InvalidExpiry();
  error LockRequired();
  error CannotBurnFlowingTokens();
}
