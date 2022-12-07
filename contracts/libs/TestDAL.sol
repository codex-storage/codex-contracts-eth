// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./DAL.sol";

// exposes public functions for testing
contract TestDAL {
  using DAL for DAL.Database;
  using EnumerableSet for EnumerableSet.Bytes32Set;

  event OperationResult(bool result);

  DAL.Database private _db;

  function insertRequest(DAL.RequestId requestId,
                         DAL.ClientId clientId,
                         DAL.Ask calldata ask,
                         DAL.Content calldata content,
                         uint256 expiry,
                         bytes32 nonce)
    public
  {
    _db.insert(requestId, clientId, ask, content, expiry, nonce);
  }

  function insertSlot(DAL.Slot memory slot) public {
    _db.insert(slot);
  }

  function insertClient(DAL.ClientId clientId) public {
    _db.insert(clientId);
  }

  function insertHost(DAL.HostId hostId) public {
    _db.insert(hostId);
  }

  function insertHostRequest(DAL.HostId hostId,
                             DAL.RequestId requestId)
    public
  {
    DAL.Host storage host = _db.select(hostId);
    _db.insert(host.requests, requestId);
  }

  function insertClientRequest(DAL.ClientId clientId,
                               DAL.RequestId requestId)
    public
  {
    DAL.Client storage client = _db.select(clientId);
    _db.insert(client.requests, requestId);
  }

  function insertHostSlot(DAL.HostId hostId,
                          DAL.SlotId slotId)
    public
  {
    DAL.Host storage host = _db.select(hostId);
    _db.insert(host.slots, slotId);
  }

  function selectRequest(DAL.RequestId requestId)
    public
    view
    returns (DAL.RequestId,
             DAL.ClientId,
             DAL.Ask memory,
             DAL.Content memory,
             uint256,
             bytes32,
             bytes32[] memory)
  {
    DAL.Request storage request = _db.select(requestId);
    return (request.id,
            request.client,
            request.ask,
            request.content,
            request.expiry,
            request.nonce,
            request.slots.values());
  }

  function selectSlot(DAL.SlotId slotId)
    public
    view
    returns (DAL.SlotId, DAL.HostId, bool, DAL.RequestId)
  {
    DAL.Slot storage slot = _db.select(slotId);
    return (slot.id, slot.host, slot.hostPaid, slot.requestId);
  }

  function selectClient(DAL.ClientId clientId)
    public
    view
    returns (DAL.ClientId, bytes32[] memory)
  {
    DAL.Client storage client = _db.select(clientId);
    return (client.id, client.requests.values());
  }

  function selectHost(DAL.HostId hostId)
    public
    view
    returns (DAL.HostId, bytes32[] memory, bytes32[] memory)
  {
    DAL.Host storage host = _db.select(hostId);
    return (host.id, host.slots.values(), host.requests.values());
  }

  function requestExists(DAL.RequestId requestId)
    public
    view
    returns (bool)
  {
    return _db.exists(requestId);
  }

  function slotExists(DAL.SlotId slotId)
    public
    view
    returns (bool)
  {
    return _db.exists(slotId);
  }

  function clientExists(DAL.ClientId clientId)
    public
    view
    returns (bool)
  {
    return _db.exists(clientId);
  }

  function hostExists(DAL.HostId hostId)
    public
    view
    returns (bool)
  {
    return _db.exists(hostId);
  }

  function removeRequest(DAL.RequestId requestId) public {
    DAL.Request storage request = _db.select(requestId);
    _db.remove(request);
  }

  function removeSlot(DAL.SlotId slotId) public {
    DAL.Slot storage slot = _db.select(slotId);
    _db.remove(slot);
  }

  function removeClient(DAL.ClientId clientId) public {
    DAL.Client storage client = _db.select(clientId);
    _db.remove(client);
  }

  function removeHost(DAL.HostId hostId) public {
    DAL.Host storage host = _db.select(hostId);
    _db.remove(host);
  }

  function removeClientRequest(DAL.ClientId clientId,
                               DAL.RequestId requestId)
    public
  {
    DAL.Client storage client = _db.select(clientId);
    _db.remove(client.requests, requestId);
  }

  function removeHostRequest(DAL.HostId hostId,
                             DAL.RequestId requestId)
    public
  {
    DAL.Host storage host = _db.select(hostId);
    _db.remove(host.requests, requestId);
  }

  function removeHostSlot(DAL.HostId hostId,
                          DAL.SlotId slotId)
    public
  {
    DAL.Host storage host = _db.select(hostId);
    _db.remove(host.slots, slotId);
  }

  function clearSlots(DAL.HostId hostId,
                      DAL.RequestId requestId,
                      uint256 maxIterations)
    public
  {
    DAL.Host storage host = _db.select(hostId);
    _db.clearSlots(host, requestId, maxIterations);
  }

  function activeSlots(DAL.HostId hostId)
    public
    view
    returns (DAL.SlotId[] memory)
  {
    DAL.Host storage host = _db.select(hostId);
    return _db.activeSlots(host);
  }

  function toSlotId(DAL.RequestId requestId, uint256 slotIndex)
    public
    pure
    returns (DAL.SlotId)
  {
    return toSlotId(requestId, slotIndex);
  }
}
