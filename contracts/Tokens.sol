// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

/// Represents a flow of tokens. Uses a uint96 to represent the flow rate, which
/// should be more than enough. Given a standard 18 decimal places for the
/// ERC20 token, this still allows for a rate of 10^10 whole coins per second.
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

library Tokens {
  /// Calculates how many tokens are accumulated when a token flow is maintained
  /// for a duration of time.
  function accumulate(
    TokensPerSecond rate,
    Duration duration
  ) internal pure returns (uint128) {
    return uint128(TokensPerSecond.unwrap(rate)) * Duration.unwrap(duration);
  }
}
