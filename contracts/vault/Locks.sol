// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

/// A time-lock for funds
struct Lock {
  /// The lock unlocks at this time
  Timestamp expiry;
  /// The expiry can be extended no further than this
  Timestamp maximum;
  /// Indicates whether fund is frozen, and at what time
  Timestamp frozenAt;
  /// The total amount of tokens locked up in the fund
  uint128 value;
}

/// A lock can go through the following states:
///
///     -----------------------------------------------
///    |                                               |
///     -->  Inactive ---> Locked -----> Withdrawing --
///                          \               ^
///                           \             /
///                            --> Frozen --
///
enum LockStatus {
  /// Indicates that the fund is inactive and contains no tokens. This is the
  /// initial state, or the state after all tokens have been withdrawn.
  Inactive,
  /// Indicates that a time-lock is set and withdrawing tokens is not allowed. A
  /// fund needs to be locked for deposits, transfers, flows and burning to be
  /// allowed.
  Locked,
  /// Indicates that a locked fund is frozen. Flows have stopped, nothing is
  /// allowed until the fund unlocks.
  Frozen,
  /// Indicates the fund has unlocked and withdrawing is allowed. Other
  /// operations are no longer allowed.
  Withdrawing
}

library Locks {
  function status(Lock memory lock) internal view returns (LockStatus) {
    if (Timestamps.currentTime() < lock.expiry) {
      if (lock.frozenAt != Timestamp.wrap(0)) {
        return LockStatus.Frozen;
      }
      return LockStatus.Locked;
    }
    if (lock.maximum == Timestamp.wrap(0)) {
      return LockStatus.Inactive;
    }
    return LockStatus.Withdrawing;
  }

  function flowEnd(Lock memory lock) internal pure returns (Timestamp) {
    if (lock.frozenAt != Timestamp.wrap(0)) {
      return lock.frozenAt;
    }
    return lock.expiry;
  }
}
