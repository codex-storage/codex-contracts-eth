// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./TokensPerSecond.sol";

struct Account {
  uint128 available;
  uint128 designated;
  TokensPerSecond flow;
  Timestamp flowUpdated;
}

library Accounts {
  function isValidAt(
    Account memory account,
    Timestamp timestamp
  ) internal pure returns (bool) {
    if (account.flow < TokensPerSecond.wrap(0)) {
      return uint128(-accumulateFlow(account, timestamp)) <= account.available;
    } else {
      return true;
    }
  }

  function at(
    Account memory account,
    Timestamp timestamp
  ) internal pure returns (Account memory) {
    Account memory result = account;
    if (result.flow != TokensPerSecond.wrap(0)) {
      int128 accumulated = accumulateFlow(result, timestamp);
      if (accumulated >= 0) {
        result.designated += uint128(accumulated);
      } else {
        result.available -= uint128(-accumulated);
      }
    }
    result.flowUpdated = timestamp;
    return result;
  }

  function accumulateFlow(
    Account memory account,
    Timestamp timestamp
  ) private pure returns (int128) {
    int128 rate = TokensPerSecond.unwrap(account.flow);
    Timestamp start = account.flowUpdated;
    Timestamp end = timestamp;
    uint64 duration = Timestamp.unwrap(end) - Timestamp.unwrap(start);
    return rate * int128(uint128(duration));
  }
}
