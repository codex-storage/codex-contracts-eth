// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

struct Lock {
  Timestamp expiry;
  Timestamp maximum;
  uint128 value;
  bool burned;
}

enum LockStatus {
  NoLock,
  Locked,
  Unlocked,
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
