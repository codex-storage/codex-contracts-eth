// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AccountLocks.sol";

// exposes internal functions for testing
contract TestAccountLocks is AccountLocks {
  function createLock(LockId id, uint256 expiry) public {
    _createLock(id, expiry);
  }

  function lock(address account, LockId id) public {
    _lock(account, id);
  }

  function unlock(LockId id) public {
    _unlock(id);
  }

  function unlockAccount() public {
    _unlockAccount();
  }

  function extendLockExpiryTo(LockId lockId, uint256 expiry) public {
    _extendLockExpiryTo(lockId, expiry);
  }
}
