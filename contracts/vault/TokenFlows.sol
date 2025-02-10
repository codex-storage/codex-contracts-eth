// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

type TokensPerSecond is uint96;

using {_tokensPerSecondMinus as -} for TokensPerSecond global;
using {_tokensPerSecondPlus as +} for TokensPerSecond global;
using {_tokensPerSecondEquals as ==} for TokensPerSecond global;
using {_tokensPerSecondAtMost as <=} for TokensPerSecond global;

function _tokensPerSecondMinus(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (TokensPerSecond) {
  return
    TokensPerSecond.wrap(TokensPerSecond.unwrap(a) - TokensPerSecond.unwrap(b));
}

function _tokensPerSecondPlus(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (TokensPerSecond) {
  return
    TokensPerSecond.wrap(TokensPerSecond.unwrap(a) + TokensPerSecond.unwrap(b));
}

function _tokensPerSecondEquals(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (bool) {
  return TokensPerSecond.unwrap(a) == TokensPerSecond.unwrap(b);
}

function _tokensPerSecondAtMost(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (bool) {
  return TokensPerSecond.unwrap(a) <= TokensPerSecond.unwrap(b);
}

library TokenFlows {
  function accumulate(
    TokensPerSecond rate,
    Duration duration
  ) internal pure returns (uint128) {
    return uint128(TokensPerSecond.unwrap(rate)) * Duration.unwrap(duration);
  }
}
