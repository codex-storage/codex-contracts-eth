// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AccountLocks.sol";

// exposes internal functions for testing
contract TestAccountLocks is AccountLocks {
  function createLock(bytes32 id, uint256 expiry) public {
    _createLock(id, expiry);
  }

  function lock(address account, bytes32 id) public {
    _lock(account, id);
  }

  function unlock(bytes32 id) public {
    _unlock(id);
  }

  function unlockAccount() public {
    _unlockAccount();
  }
}
