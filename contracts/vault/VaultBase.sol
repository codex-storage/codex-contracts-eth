// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Accounts.sol";
import "./Funds.sol";

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
/// (∀ controller ∈ Controller, fundId ∈ FundId:
///   fund.lockExpiry <= fund.lockMaximum
///   where fund = _funds[controller][fundId])
///
/// The account invariant ensures that the outgoing token flow can be sustained
/// for the maximum time that a fund can be locked:
///
/// (∀ controller ∈ Controller, fundId ∈ FundId, accountId ∈ AccountId:
///   flow.outgoing * (fund.lockMaximum - flow.updated) <= balance.available
///   where fund = _funds[controller][fundId])
///   and flow = _accounts[controller][fundId][accountId].flow
///   and balance = _accounts[controller][fundId][accountId].balance
///
/// The flow invariant ensures that incoming and outgoing flow rates match:
///
/// (∀ controller ∈ Controller, fundId ∈ FundId:
///   (∑ accountId ∈ AccountId: accounts[accountId].flow.incoming) =
///   (∑ accountId ∈ AccountId: accounts[accountId].flow.outgoing)
///   where accounts = _accounts[controller][fundId])
///
abstract contract VaultBase {
  using SafeERC20 for IERC20;
  using Accounts for Account;
  using Funds for Fund;

  IERC20 internal immutable _token;

  /// Represents a smart contract that can redistribute and burn tokens in funds
  type Controller is address;
  /// Unique identifier for a fund, chosen by the controller
  type FundId is bytes32;

  /// Each controller has its own set of funds
  mapping(Controller => mapping(FundId => Fund)) private _funds;
  /// Each account holder has its own set of accounts in a fund
  mapping(Controller => mapping(FundId => mapping(AccountId => Account)))
    private _accounts;

  constructor(IERC20 token) {
    _token = token;
  }

  function _getFundStatus(
    Controller controller,
    FundId fundId
  ) internal view returns (FundStatus) {
    return _funds[controller][fundId].status();
  }

  function _getLockExpiry(
    Controller controller,
    FundId fundId
  ) internal view returns (Timestamp) {
    return _funds[controller][fundId].lockExpiry;
  }

  function _getBalance(
    Controller controller,
    FundId fundId,
    AccountId accountId
  ) internal view returns (Balance memory) {
    Fund memory fund = _funds[controller][fundId];
    FundStatus status = fund.status();
    if (status == FundStatus.Locked) {
      Account memory account = _accounts[controller][fundId][accountId];
      account.update(Timestamps.currentTime());
      return account.balance;
    }
    if (status == FundStatus.Withdrawing || status == FundStatus.Frozen) {
      Account memory account = _accounts[controller][fundId][accountId];
      account.update(fund.flowEnd());
      return account.balance;
    }
    return Balance({available: 0, designated: 0});
  }

  function _lock(
    Controller controller,
    FundId fundId,
    Timestamp expiry,
    Timestamp maximum
  ) internal {
    Fund memory fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Inactive, VaultFundAlreadyLocked());
    fund.lockExpiry = expiry;
    fund.lockMaximum = maximum;
    _checkLockInvariant(fund);
    _funds[controller][fundId] = fund;
  }

  function _extendLock(
    Controller controller,
    FundId fundId,
    Timestamp expiry
  ) internal {
    Fund memory fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Locked, VaultFundNotLocked());
    require(fund.lockExpiry <= expiry, VaultInvalidExpiry());
    fund.lockExpiry = expiry;
    _checkLockInvariant(fund);
    _funds[controller][fundId] = fund;
  }

  function _deposit(
    Controller controller,
    FundId fundId,
    AccountId accountId,
    uint128 amount
  ) internal {
    Fund storage fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Locked, VaultFundNotLocked());

    Account storage account = _accounts[controller][fundId][accountId];

    account.balance.available += amount;
    fund.value += amount;

    _token.safeTransferFrom(
      Controller.unwrap(controller),
      address(this),
      amount
    );
  }

  function _designate(
    Controller controller,
    FundId fundId,
    AccountId accountId,
    uint128 amount
  ) internal {
    Fund memory fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Locked, VaultFundNotLocked());

    Account memory account = _accounts[controller][fundId][accountId];
    require(amount <= account.balance.available, VaultInsufficientBalance());

    account.balance.available -= amount;
    account.balance.designated += amount;
    _checkAccountInvariant(account, fund);

    _accounts[controller][fundId][accountId] = account;
  }

  function _transfer(
    Controller controller,
    FundId fundId,
    AccountId from,
    AccountId to,
    uint128 amount
  ) internal {
    Fund memory fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Locked, VaultFundNotLocked());

    Account memory sender = _accounts[controller][fundId][from];
    require(amount <= sender.balance.available, VaultInsufficientBalance());

    sender.balance.available -= amount;
    _checkAccountInvariant(sender, fund);

    _accounts[controller][fundId][from] = sender;

    _accounts[controller][fundId][to].balance.available += amount;
  }

  function _flow(
    Controller controller,
    FundId fundId,
    AccountId from,
    AccountId to,
    TokensPerSecond rate
  ) internal {
    Fund memory fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Locked, VaultFundNotLocked());

    Account memory sender = _accounts[controller][fundId][from];
    sender.flowOut(rate);
    _checkAccountInvariant(sender, fund);
    _accounts[controller][fundId][from] = sender;

    Account memory receiver = _accounts[controller][fundId][to];
    receiver.flowIn(rate);
    _accounts[controller][fundId][to] = receiver;
  }

  function _burnDesignated(
    Controller controller,
    FundId fundId,
    AccountId accountId,
    uint128 amount
  ) internal {
    Fund storage fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Locked, VaultFundNotLocked());

    Account storage account = _accounts[controller][fundId][accountId];
    require(account.balance.designated >= amount, VaultInsufficientBalance());

    account.balance.designated -= amount;

    fund.value -= amount;

    _token.safeTransfer(address(0xdead), amount);
  }

  function _burnAccount(
    Controller controller,
    FundId fundId,
    AccountId accountId
  ) internal {
    Fund storage fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Locked, VaultFundNotLocked());

    Account memory account = _accounts[controller][fundId][accountId];
    require(account.flow.incoming == account.flow.outgoing, VaultFlowNotZero());
    uint128 amount = account.balance.available + account.balance.designated;

    fund.value -= amount;

    delete _accounts[controller][fundId][accountId];

    _token.safeTransfer(address(0xdead), amount);
  }

  function _freezeFund(Controller controller, FundId fundId) internal {
    Fund storage fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Locked, VaultFundNotLocked());

    fund.frozenAt = Timestamps.currentTime();
  }

  function _withdraw(
    Controller controller,
    FundId fundId,
    AccountId accountId
  ) internal {
    Fund memory fund = _funds[controller][fundId];
    require(fund.status() == FundStatus.Withdrawing, VaultFundNotUnlocked());

    Account memory account = _accounts[controller][fundId][accountId];
    account.update(fund.flowEnd());
    uint128 amount = account.balance.available + account.balance.designated;

    fund.value -= amount;

    if (fund.value == 0) {
      delete _funds[controller][fundId];
    } else {
      _funds[controller][fundId] = fund;
    }

    delete _accounts[controller][fundId][accountId];

    (address owner, ) = Accounts.decodeId(accountId);
    _token.safeTransfer(owner, amount);
  }

  function _checkLockInvariant(Fund memory fund) private pure {
    require(fund.lockExpiry <= fund.lockMaximum, VaultInvalidExpiry());
  }

  function _checkAccountInvariant(
    Account memory account,
    Fund memory fund
  ) private pure {
    require(account.isSolventAt(fund.lockMaximum), VaultInsufficientBalance());
  }

  error VaultInsufficientBalance();
  error VaultInvalidExpiry();
  error VaultFundNotLocked();
  error VaultFundNotUnlocked();
  error VaultFundAlreadyLocked();
  error VaultFlowNotZero();
}
