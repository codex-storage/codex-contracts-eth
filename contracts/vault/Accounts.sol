// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./TokenFlows.sol";
import "./Timestamps.sol";

/// Used to identify an account. The first 20 bytes consist of the address of
/// the account holder, and the last 12 bytes consist of a discriminator value.
type AccountId is bytes32;

/// Records the token balance and the incoming and outgoing token flows
struct Account {
  Balance balance;
  Flow flow;
}

/// The account balance. Fits in 32 bytes to minimize storage costs.
/// A uint128 is used to record the amount of tokens, which should be more than
/// enough. Given a standard 18 decimal places for the ERC20 token, this still
/// allows for 10^20 whole coins.
struct Balance {
  /// Available tokens can be transfered
  uint128 available;
  /// Designated tokens can no longer be transfered
  uint128 designated;
}

/// The incoming and outgoing flows of an account. Fits in 32 bytes to minimize
/// storage costs.
struct Flow {
  /// Rate of outgoing tokens
  TokensPerSecond outgoing;
  /// Rate of incoming tokens
  TokensPerSecond incoming;
  /// Last time that the flow was updated
  Timestamp updated;
}

library Accounts {
  using Accounts for Account;
  using TokenFlows for TokensPerSecond;
  using Timestamps for Timestamp;

  /// Creates an account id from the account holder address and a discriminator.
  /// The discriminiator can be used to create different accounts that belong to
  /// the same account holder.
  function encodeId(
    address holder,
    bytes12 discriminator
  ) internal pure returns (AccountId) {
    bytes32 left = bytes32(bytes20(holder));
    bytes32 right = bytes32(uint256(uint96(discriminator)));
    return AccountId.wrap(left | right);
  }

  /// Extracts the account holder and the discriminator from the the account id
  function decodeId(AccountId id) internal pure returns (address, bytes12) {
    bytes32 unwrapped = AccountId.unwrap(id);
    address holder = address(bytes20(unwrapped));
    bytes12 discriminator = bytes12(uint96(uint256(unwrapped)));
    return (holder, discriminator);
  }

  /// Calculates whether the available balance is sufficient to sustain the
  /// outgoing flow of tokens until the specified timestamp
  function isSolventAt(
    Account memory account,
    Timestamp timestamp
  ) internal pure returns (bool) {
    Duration duration = account.flow.updated.until(timestamp);
    uint128 outgoing = account.flow.outgoing.accumulate(duration);
    return outgoing <= account.balance.available;
  }

  /// Updates the available and designated balances by accumulating the
  /// outgoing and incoming flows up until the specified timestamp. Outgoing
  /// tokens are deducted from the available balance. Incoming tokens are added
  /// to the designated tokens.
  function accumulateFlows(
    Account memory account,
    Timestamp timestamp
  ) internal pure {
    Duration duration = account.flow.updated.until(timestamp);
    account.balance.available -= account.flow.outgoing.accumulate(duration);
    account.balance.designated += account.flow.incoming.accumulate(duration);
    account.flow.updated = timestamp;
  }

  /// Starts an incoming flow of tokens at the specified rate. If there already
  /// is a flow of incoming tokens, then its rate is increased accordingly.
  function flowIn(Account memory account, TokensPerSecond rate) internal view {
    account.accumulateFlows(Timestamps.currentTime());
    account.flow.incoming = account.flow.incoming + rate;
  }

  /// Starts an outgoing flow of tokens at the specified rate. If there is
  /// already a flow of incoming tokens, then these are used to pay for the
  /// outgoing flow. If there are insuffient incoming tokens, then the outgoing
  /// rate is increased.
  function flowOut(Account memory account, TokensPerSecond rate) internal view {
    account.accumulateFlows(Timestamps.currentTime());
    if (rate <= account.flow.incoming) {
      account.flow.incoming = account.flow.incoming - rate;
    } else {
      account.flow.outgoing = account.flow.outgoing + rate;
      account.flow.outgoing = account.flow.outgoing - account.flow.incoming;
      account.flow.incoming = TokensPerSecond.wrap(0);
    }
  }
}
