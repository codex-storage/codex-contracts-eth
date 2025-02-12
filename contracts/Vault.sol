// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./vault/VaultBase.sol";

/// A vault provides a means for smart contracts to control allocation of ERC20
/// tokens without the need to hold the ERC20 tokens themselves, thereby
/// decreasing their own attack surface.
///
/// A vault keeps track of funds for a smart contract. This smart contract is
/// called the controller of the funds. Each controller has its own independent
/// set of funds. Each fund has a number of recipients, and every recipient has
/// its own account within the fund.
///
///     Vault -> Controller -> Fund -> Account
///
/// Funds are identified by a unique 32 byte identifier, chosen by the
/// controller.
///
/// An account has a balance, of which a part can be designated. Designated
/// tokens can no longer be transfered to another account.
///
/// A typical flow in which a controller uses the vault to handle funds:
/// 1. the controller chooses a unique id for the fund
/// 2. the controller locks the fund for an amount of time
/// 3. the controller deposits ERC20 tokens into the fund
/// 4. the controller transfers tokens between accounts in the fund
/// 5. the fund unlocks after a while, freezing the account balances
/// 6. the controller withdraws ERC20 tokens from the fund for a recipient, or
///    the recipient initiates the withdrawal itself
///
/// The vault makes it harder for an attacker to extract funds, through several
/// mechanisms:
/// - tokens in a fund can only be reassigned while the fund is time-locked, and
///   only be withdrawn after the lock unlocks, delaying an attacker's attempt
///   at extraction of tokens from the vault
/// - tokens in a fund can not be reassigned when the lock unlocks, ensuring
///   that they can no longer be reassigned to an attacker
/// - when storing collateral, it can be designated for the collateral provider,
///   ensuring that it cannot be reassigned to an attacker
/// - malicious upgrades to a fund controller cannot prevent recipients from
///   withdrawing their tokens
/// - burning tokens in a fund ensures that these tokens can no longer be
///   extracted by an attacker
///
contract Vault is VaultBase, Pausable, Ownable {
  constructor(IERC20 token) VaultBase(token) Ownable(msg.sender) {}

  /// The amount of tokens that are currently assigned to a recipient in a fund.
  /// This includes available and designated tokens. Available tokens can be
  /// transfered to other accounts, but designated tokens cannot.
  function getBalance(
    Fund fund,
    Recipient recipient
  ) public view returns (uint128) {
    Controller controller = Controller.wrap(msg.sender);
    Balance memory balance = _getBalance(controller, fund, recipient);
    return balance.available + balance.designated;
  }

  /// The amount of tokens that are currently designated to a recipient in a
  /// fund. These tokens can no longer be transfered to other accounts.
  function getDesignatedBalance(
    Fund fund,
    Recipient recipient
  ) public view returns (uint128) {
    Controller controller = Controller.wrap(msg.sender);
    Balance memory balance = _getBalance(controller, fund, recipient);
    return balance.designated;
  }

  /// Returns the status of the lock on the fund. Most operations on the vault
  /// can only be done by the controller when the funds are locked. Withdrawal
  /// can only be done when the funds are unlocked.
  function getLockStatus(Fund fund) public view returns (LockStatus) {
    Controller controller = Controller.wrap(msg.sender);
    return _getLockStatus(controller, fund);
  }

  /// Returns the expiry time of the lock on the fund. A locked fund unlocks
  /// automatically at this timestamp.
  function getLockExpiry(Fund fund) public view returns (Timestamp) {
    Controller controller = Controller.wrap(msg.sender);
    return _getLockExpiry(controller, fund);
  }

  /// Locks the fund until the expiry timestamp. The lock expiry can be extended
  /// later, but no more than the maximum timestamp.
  function lock(
    Fund fund,
    Timestamp expiry,
    Timestamp maximum
  ) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _lock(controller, fund, expiry, maximum);
  }

  /// Delays unlocking of a locked fund. The new expiry should be later than
  /// the existing expiry, but no later than the maximum timestamp that was
  /// provided when locking the fund.
  /// Only allowed when the lock has not unlocked yet.
  function extendLock(Fund fund, Timestamp expiry) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _extendLock(controller, fund, expiry);
  }

  /// Deposits an amount of tokens into the vault, and adds them to the balance
  /// of the recipient. ERC20 tokens are transfered from the caller to the vault
  /// contract.
  /// Only allowed when the fund is locked.
  function deposit(
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _deposit(controller, fund, recipient, amount);
  }

  /// Takes an amount of tokens from the recipient's balance and designates them
  /// for the recipient. These tokens are no longer available to be transfered
  /// to other accounts.
  /// Only allowed when the fund is locked.
  function designate(
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _designate(controller, fund, recipient, amount);
  }

  /// Transfers an amount of tokens from the acount of one recipient to the
  /// other.
  /// Only allowed when the fund is locked.
  function transfer(
    Fund fund,
    Recipient from,
    Recipient to,
    uint128 amount
  ) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _transfer(controller, fund, from, to, amount);
  }

  /// Transfers tokens from the account of one recipient to the other over time.
  /// Every second a number of tokens are transfered, until the fund is
  /// unlocked. After flowing into an account, these tokens become designated
  /// tokens, so they cannot be transfered again.
  /// Only allowed when the fund is locked.
  /// Only allowed when the balance is sufficient to sustain the flow until the
  /// fund unlocks, even if the lock expiry time is extended to its maximum.
  function flow(
    Fund fund,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _flow(controller, fund, from, to, rate);
  }

  /// Burns an amount of designated tokens from the account of the recipient.
  /// Only allowed when the fund is locked.
  function burnDesignated(
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _burnDesignated(controller, fund, recipient, amount);
  }

  /// Burns all tokens from the account of the recipient.
  /// Only allowed when the fund is locked.
  /// Only allowed when no funds are flowing into or out of the account.
  function burnAccount(Fund fund, Recipient recipient) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _burnAccount(controller, fund, recipient);
  }

  /// Burns all tokens from all accounts in a fund.
  /// Only allowed when the fund is locked.
  function burnFund(Fund fund) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _burnFund(controller, fund);
  }

  /// Transfers all ERC20 tokens in the recipient's account out of the vault to
  /// the recipient address.
  /// Only allowed when the fund is unlocked.
  /// ⚠️ The recipient can also withdraw itself, so when designing a smart
  /// contract that controls funds in the vault, don't assume that only this
  /// smart contract can initiate a withdrawal ⚠️
  function withdraw(Fund fund, Recipient recipient) public whenNotPaused {
    Controller controller = Controller.wrap(msg.sender);
    _withdraw(controller, fund, recipient);
  }

  /// Allows a recipient to withdraw its tokens from a fund directly, bypassing
  /// the need to ask the controller of the fund to initiate the withdrawal.
  /// Only allowed when the fund is unlocked.
  function withdrawByRecipient(Controller controller, Fund fund) public {
    Recipient recipient = Recipient.wrap(msg.sender);
    _withdraw(controller, fund, recipient);
  }

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }
}
