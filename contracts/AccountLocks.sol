// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AccountLocks {
  uint256 public constant MAX_LOCKS_PER_ACCOUNT = 128;

  mapping(bytes32 => Lock) private locks;
  mapping(address => Account) private accounts;

  function _createLock(bytes32 id, uint256 expiry) internal {
    require(locks[id].owner == address(0), "Lock already exists");
    locks[id] = Lock(msg.sender, expiry, false);
  }

  function _lock(address account, bytes32 lockId) internal {
    require(locks[lockId].owner != address(0), "Lock does not exist");
    bytes32[] storage accountLocks = accounts[account].locks;
    removeInactiveLocks(accountLocks);
    require(accountLocks.length < MAX_LOCKS_PER_ACCOUNT, "Max locks reached");
    accountLocks.push(lockId);
  }

  function _unlock(bytes32 lockId) internal {
    Lock storage lock = locks[lockId];
    require(lock.owner != address(0), "Lock does not exist");
    require(lock.owner == msg.sender, "Only lock creator can unlock");
    lock.unlocked = true;
  }

  function _unlockAccount() internal {
    bytes32[] storage accountLocks = accounts[msg.sender].locks;
    removeInactiveLocks(accountLocks);
    require(accountLocks.length == 0, "Account locked");
  }

  function removeInactiveLocks(bytes32[] storage lockIds) private {
    uint256 index = 0;
    while (true) {
      if (index >= lockIds.length) {
        return;
      }
      if (isInactive(locks[lockIds[index]])) {
        lockIds[index] = lockIds[lockIds.length - 1];
        lockIds.pop();
      } else {
        index++;
      }
    }
  }

  function isInactive(Lock storage lock) private view returns (bool) {
    // solhint-disable-next-line not-rely-on-time
    return lock.unlocked || lock.expiry <= block.timestamp;
  }

  struct Lock {
    address owner;
    uint256 expiry;
    bool unlocked;
  }

  struct Account {
    bytes32[] locks;
  }
}
