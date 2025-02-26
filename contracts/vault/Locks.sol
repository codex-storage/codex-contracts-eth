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
///     ------------------------------------------
///    |                                          |
///     -->  NoLock ---> Locked -----> UnLocked --
///                        \               ^
///                         \             /
///                          --> Frozen --
///
enum LockStatus {
  /// Indicates that no lock is set. This is the initial state, or the state
  /// after all tokens have been withdrawn.
  NoLock,
  /// Indicates that the fund is locked. Withdrawing tokens is not allowed.
  Locked,
  /// Indicates that the fund is frozen. Flows have stopped, nothing is allowed
  /// until the fund unlocks.
  Frozen,
  /// Indicates that the lock is unlocked. Withdrawing is allowed.
  Unlocked
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
      return LockStatus.NoLock;
    }
    return LockStatus.Unlocked;
  }

  function flowEnd(Lock memory lock) internal pure returns (Timestamp) {
    if (lock.frozenAt != Timestamp.wrap(0)) {
      return lock.frozenAt;
    }
    return lock.expiry;
  }
}
