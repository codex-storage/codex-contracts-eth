// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./TokenFlows.sol";
import "./Timestamps.sol";

struct Account {
  Balance balance;
  Flow flow;
}

struct Balance {
  uint128 available;
  uint128 designated;
}

struct Flow {
  TokensPerSecond outgoing;
  TokensPerSecond incoming;
  Timestamp updated;
}

library Accounts {
  using Accounts for Account;
  using TokenFlows for TokensPerSecond;
  using Timestamps for Timestamp;

  function isSolventAt(
    Account memory account,
    Timestamp timestamp
  ) internal pure returns (bool) {
    Duration duration = account.flow.updated.until(timestamp);
    uint128 outgoing = account.flow.outgoing.accumulate(duration);
    return outgoing <= account.balance.available;
  }

  function update(Account memory account, Timestamp timestamp) internal pure {
    Duration duration = account.flow.updated.until(timestamp);
    account.balance.available -= account.flow.outgoing.accumulate(duration);
    account.balance.designated += account.flow.incoming.accumulate(duration);
    account.flow.updated = timestamp;
  }

  function flowIn(Account memory account, TokensPerSecond rate) internal view {
    account.update(Timestamps.currentTime());
    account.flow.incoming = account.flow.incoming + rate;
  }

  function flowOut(Account memory account, TokensPerSecond rate) internal view {
    account.update(Timestamps.currentTime());
    if (rate <= account.flow.incoming) {
      account.flow.incoming = account.flow.incoming - rate;
    } else {
      account.flow.outgoing = account.flow.outgoing + rate;
      account.flow.outgoing = account.flow.outgoing - account.flow.incoming;
      account.flow.incoming = TokensPerSecond.wrap(0);
    }
  }
}
