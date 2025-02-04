// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Timestamps.sol";
import "./TokensPerSecond.sol";
import "./Flows.sol";
import "./Locks.sol";

using SafeERC20 for IERC20;
using Timestamps for Timestamp;
using Flows for Flow;
using Locks for Lock;

abstract contract VaultBase {
  IERC20 internal immutable _token;

  type Controller is address;
  type Fund is bytes32;
  type Recipient is address;

  struct Account {
    uint128 available;
    uint128 designated;
  }

  mapping(Controller => mapping(Fund => Lock)) private _locks;
  mapping(Controller => mapping(Fund => mapping(Recipient => Account)))
    private _accounts;
  mapping(Controller => mapping(Fund => mapping(Recipient => Flow)))
    private _flows;

  constructor(IERC20 token) {
    _token = token;
  }

  function _getAccount(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal view returns (Account memory) {
    Account storage account = _accounts[controller][fund][recipient];
    Flow storage flow = _flows[controller][fund][recipient];
    Lock storage lock = _locks[controller][fund];
    Timestamp timestamp = Timestamps.currentTime();
    return _getAccountAt(account, flow, lock, timestamp);
  }

  function _getAccountAt(
    Account memory account,
    Flow memory flow,
    Lock storage lock,
    Timestamp timestamp
  ) private view returns (Account memory) {
    Account memory result = account;
    if (flow.rate != TokensPerSecond.wrap(0)) {
      Timestamp end = Timestamps.earliest(timestamp, lock.expiry);
      int128 accumulated = flow._totalAt(end);
      if (accumulated >= 0) {
        result.designated += uint128(accumulated);
      } else {
        result.available -= uint128(-accumulated);
      }
    }
    return result;
  }

  function _getLock(
    Controller controller,
    Fund fund
  ) internal view returns (Lock memory) {
    return _locks[controller][fund];
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
    Lock memory lock = _locks[controller][fund];
    require(lock.isLocked(), LockRequired());

    Recipient recipient = Recipient.wrap(from);
    Account memory account = _accounts[controller][fund][recipient];

    account.available += amount;
    lock.value += amount;

    _accounts[controller][fund][recipient] = account;
    _locks[controller][fund] = lock;

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
    require(amount <= account.available, InsufficientBalance());

    account.available -= amount;
    account.designated += amount;

    Flow memory flow = _flows[controller][fund][recipient];
    _checkFlowInvariant(account, lock, flow);

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

    Account memory senderAccount = _getAccount(controller, fund, from);
    Account memory receiverAccount = _getAccount(controller, fund, to);
    require(amount <= senderAccount.available, InsufficientBalance());

    senderAccount.available -= amount;
    receiverAccount.available += amount;

    Flow memory senderFlow = _flows[controller][fund][from];
    _checkFlowInvariant(senderAccount, lock, senderFlow);

    _accounts[controller][fund][from] = senderAccount;
    _accounts[controller][fund][to] = receiverAccount;
  }

  function _flow(
    Controller controller,
    Fund fund,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) internal {
    require(rate >= TokensPerSecond.wrap(0), NegativeFlow());

    Lock memory lock = _locks[controller][fund];
    require(lock.isLocked(), LockRequired());

    Account memory senderAccount = _getAccount(controller, fund, from);
    Account memory receiverAccount = _getAccount(controller, fund, to);
    Flow memory senderFlow = _flows[controller][fund][from];
    Flow memory receiverFlow = _flows[controller][fund][to];

    Timestamp start = Timestamps.currentTime();
    senderFlow.start = start;
    senderFlow.rate = senderFlow.rate - rate;
    receiverFlow.start = start;
    receiverFlow.rate = receiverFlow.rate + rate;

    _checkFlowInvariant(senderAccount, lock, senderFlow);

    _accounts[controller][fund][from] = senderAccount;
    _accounts[controller][fund][to] = receiverAccount;
    _flows[controller][fund][from] = senderFlow;
    _flows[controller][fund][to] = receiverFlow;
  }

  function _burn(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.isLocked(), LockRequired());

    Flow memory flow = _flows[controller][fund][recipient];
    require(flow.rate == TokensPerSecond.wrap(0), CannotBurnFlowingTokens());

    Account memory account = _getAccount(controller, fund, recipient);
    uint128 amount = account.available + account.designated;

    lock.value -= amount;

    if (lock.value == 0) {
      delete _locks[controller][fund];
    } else {
      _locks[controller][fund] = lock;
    }

    _delete(controller, fund, recipient);

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
    uint128 amount = account.available + account.designated;

    lock.value -= amount;

    if (lock.value == 0) {
      delete _locks[controller][fund];
    } else {
      _locks[controller][fund] = lock;
    }

    _delete(controller, fund, recipient);

    _token.safeTransfer(Recipient.unwrap(recipient), amount);
  }

  function _delete(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) private {
    delete _accounts[controller][fund][recipient];
    delete _flows[controller][fund][recipient];
  }

  function _checkLockInvariant(Lock memory lock) private pure {
    require(lock.expiry <= lock.maximum, ExpiryPastMaximum());
  }

  function _checkFlowInvariant(
    Account memory account,
    Lock memory lock,
    Flow memory flow
  ) private pure {
    if (flow.rate < TokensPerSecond.wrap(0)) {
      uint128 outgoing = uint128(-flow._totalAt(lock.maximum));
      require(outgoing <= account.available, InsufficientBalance());
    }
  }

  error InsufficientBalance();
  error Locked();
  error AlreadyLocked();
  error ExpiryPastMaximum();
  error InvalidExpiry();
  error LockRequired();
  error NegativeFlow();
  error CannotBurnFlowingTokens();
}
