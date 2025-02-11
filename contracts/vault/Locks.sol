// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

/// A time-lock for funds
struct Lock {
  /// The lock unlocks at this time
  Timestamp expiry;
  /// The expiry can be extended no further than this
  Timestamp maximum;
  /// The total amount of tokens locked up in the fund
  uint128 value;
  /// Indicates whether the fund was burned
  bool burned;
}

/// A lock can go through the following states:
///
///     ----------------------------------------
///    |                                        |
///     -->  NoLock ---> Locked ---> UnLocked --
///                      \
///                       ---> Burned
///
enum LockStatus {
  /// Indicates that no lock is set. This is the initial state, or the state
  /// after all tokens have been withdrawn.
  NoLock,
  /// Indicates that the funds are locked. Withdrawing tokens is not allowed.
  Locked,
  /// Indicates that the lock is unlocked. Withdrawing is allowed.
  Unlocked,
  /// Indicates that all tokens in the fund are burned
  Burned
}

library Locks {
  function status(Lock memory lock) internal view returns (LockStatus) {
    if (lock.burned) {
      return LockStatus.Burned;
    }
    if (Timestamps.currentTime() < lock.expiry) {
      return LockStatus.Locked;
    }
    if (lock.maximum == Timestamp.wrap(0)) {
      return LockStatus.NoLock;
    }
    return LockStatus.Unlocked;
  }
}
