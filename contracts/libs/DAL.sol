// SPDX-License-Identifier: MIT
// inspired by: https://bitbucket.org/rhitchens2/soliditystoragepatterns/src/master/OneToMany.sol
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../Marketplace.sol";
import "./Utils.sol";

library DAL {

  using EnumerableSet for EnumerableSet.Bytes32Set;

  type RequestId is bytes32;
  type SlotId is bytes32;
  type ClientId is address;
  type HostId is address;

  struct Client {
    ClientId id; // PK

    EnumerableSet.Bytes32Set requests;
  }

  struct Host {
    HostId id; // PK

    EnumerableSet.Bytes32Set slots;
    EnumerableSet.Bytes32Set requests;
  }

  struct Request {
    RequestId id;
    ClientId client;
    Ask ask;
    Content content;
    uint256 expiry; // time at which this request expires
    bytes32 nonce; // random nonce to differentiate between similar requests

    EnumerableSet.Bytes32Set slots;
  }

  struct Slot {
    SlotId id;
    HostId host;
    bool hostPaid;
    RequestId requestId;
  }

  struct Ask {
    uint64 slots; // the number of requested slots
    uint256 slotSize; // amount of storage per slot (in number of bytes)
    uint256 duration; // how long content should be stored (in seconds)
    uint256 proofProbability; // how often storage proofs are required
    uint256 reward; // amount of tokens paid per second per slot to hosts
    uint64 maxSlotLoss; // Max slots that can be lost without data considered to be lost
  }

  struct Content {
    string cid; // content id (if part of a larger set, the chunk cid)
    Erasure erasure; // Erasure coding attributes
    PoR por; // Proof of Retrievability parameters
  }

  struct Erasure {
    uint64 totalChunks; // the total number of chunks in the larger data set
  }

  struct PoR {
    bytes u; // parameters u_1..u_s
    bytes publicKey; // public key
    bytes name; // random name
  }

  struct Database {
    mapping(RequestId => Request) requests;
    mapping(SlotId => Slot) slots;
    mapping(ClientId => Client) clients;
    mapping(HostId => Host) hosts;
  }



  /// *** CREATE OPERATIONS *** ///

  function insert(Database storage db,
                  RequestId requestId,
                  ClientId clientId,
                  Ask memory ask,
                  Content memory content,
                  uint256 expiry,
                  bytes32 nonce)
    internal
  {
    require(!isDefault(requestId), "request id required");
    require(!_isDefault(clientId), "client address required");
    require(exists(db, clientId), "client does not exist");
    require(!exists(db, requestId), "request already exists");

    Request storage r = db.requests[requestId];
    r.id = requestId;
    r.client = clientId;
    r.ask = ask;
    r.content = content;
    r.expiry = expiry;
    r.nonce = nonce;
  }

  function insert(Database storage db, ClientId clientId) internal {
    require (!exists(db, clientId), "client already exists");
    require (!_isDefault(clientId), "address required");
    Client storage c = db.clients[clientId];
    c.id = clientId;
    // NOTE: by default db.clients[client].requests already exists but has a default value
  }

  function insert(Database storage db, HostId hostId) internal {
    require (!exists(db, hostId), "host already exists");
    require (!_isDefault(hostId), "address required");
    Host storage h = db.hosts[hostId];
    h.id = hostId;
    // NOTE: by default db.hosts[host].slots already exists but has a default value
  }

  function insert(Database storage db, Slot memory slot ) internal {
    require(!_isDefault(slot.id), "slot id required");
    require(!isDefault(slot.requestId), "request id required");
    require(exists(db, slot.requestId), "request does not exist");
    require(!exists(db, slot.id), "slot already exists");
    require(exists(db, slot.host), "host does not exist");
    db.slots[slot.id] = slot;

    Request storage request = db.requests[slot.requestId];
    request.slots.add(SlotId.unwrap(slot.id));
  }

  function insert(Database storage db,
                  EnumerableSet.Bytes32Set storage requests,
                  RequestId requestId)
    internal
  {
    require(exists(db, requestId), "request does not exist");

    requests.add(RequestId.unwrap(requestId));
  }

  function insert(Database storage db,
                  EnumerableSet.Bytes32Set storage slots,
                  SlotId slotId)
    internal
  {
    require(exists(db, slotId), "slot does not exist");
    Slot storage slot = db.slots[slotId];
    require(exists(db, slot.host), "host does not exist");
    Host storage host = db.hosts[slot.host];
    require(host.requests.contains(RequestId.unwrap(slot.requestId)),
      "slot request not active");

    slots.add(SlotId.unwrap(slotId));
  }



  /// *** READ OPERATIONS *** ///

  function select(Database storage db, RequestId requestId)
    internal
    view
    returns (Request storage)
  {
    require(exists(db, requestId), "Unknown request");
    return db.requests[requestId];
  }

  function select(Database storage db, SlotId slotId)
    internal
    view
    returns (Slot storage)
  {
    require(exists(db, slotId), "Slot empty");
    return db.slots[slotId];
  }

  function select(Database storage db, ClientId clientId)
    internal
    view
    returns (Client storage)
  {
    require(exists(db, clientId), "Client does not exist");
    return db.clients[clientId];
  }

  function select(Database storage db, HostId hostId)
    internal
    view
    returns (Host storage)
  {
    require(exists(db, hostId), "Host does not exist");
    return db.hosts[hostId];
  }

  function exists(Database storage db, RequestId requestId)
    internal
    view
    returns (bool)
  {
    Request storage request = db.requests[requestId];
    return !isDefault(request.id) && !_isDefault(request.client);
  }

  function exists(Database storage db, SlotId slotId)
    internal
    view
    returns (bool)
  {
    Slot storage slot = db.slots[slotId];
    Request storage request = db.requests[slot.requestId];
    return request.slots.contains(SlotId.unwrap(slotId)) &&
           !_isDefault(slot.id) &&
           !isDefault(slot.requestId);
  }

  function exists(Database storage db, ClientId clientId)
    internal
    view
    returns (bool)
  {
    return !_isDefault(db.clients[clientId].id);
  }

  function exists(Database storage db, HostId hostId)
    internal
    view
    returns (bool)
  {
    return !_isDefault(db.hosts[hostId].id);
  }




  /// *** DELETE OPERATIONS *** ///

  function remove(Database storage db, Request storage request) internal {
    require(request.slots.length() == 0, "references slots");
    require(exists(db, request.client), "client does not exist");
    Client storage client = db.clients[request.client];
    bytes32 bRequestId = RequestId.unwrap(request.id);
    require(!client.requests.contains(bRequestId), "active request refs");

    delete db.requests[request.id];
  }

  function remove(Database storage db, Client storage client) internal {
    require(client.requests.length() == 0, "active request refs");

    delete db.clients[client.id];
  }

  function remove(Database storage db, Host storage host) internal {
    require(host.slots.length() == 0, "active slot refs");

    delete db.hosts[host.id];
  }

  function remove(Database storage db, Slot storage slot) internal {
    require(exists(db, slot.requestId), "request does not exist");
    Host storage host = db.hosts[slot.host];
    bytes32 bSlotId = SlotId.unwrap(slot.id);
    require(!host.slots.contains(bSlotId), "active slot refs");

    Request storage request = db.requests[slot.requestId];
    request.slots.remove(bSlotId);
    delete db.slots[slot.id];
  }

  function remove(Database storage db,
                  EnumerableSet.Bytes32Set storage requests,
                  RequestId requestId)
    internal
  {
    require(exists(db, requestId), "request does not exist");

    requests.remove(RequestId.unwrap(requestId));
  }

  function remove(Database storage db,
                  EnumerableSet.Bytes32Set storage slots,
                  SlotId slotId)
    internal
  {
    require(exists(db, slotId), "slot does not exist");

    slots.remove(SlotId.unwrap(slotId));
  }



  /// *** CALCULATED PROPERTIES *** ///

  // WARNING: calling this in a transaction may cause an out of gas exception
  function activeSlots(Database storage db, Host storage host)
    internal
    view
    returns (SlotId[] memory)
  {
    // perform an inner join on host.slots and host.requests
    bytes32[] memory result = new bytes32[](host.slots.length());
    uint256 counter = 0;
    for (uint256 i = 0; i < host.slots.length(); i++) {
      bytes32 slotId = host.slots.at(i);
      Slot storage slot = select(db, SlotId.wrap(slotId));
      if (host.requests.contains(RequestId.unwrap(slot.requestId))) {
        result[counter] = slotId;
        counter++;
      }
    }
    return toSlotIds(Utils.resize(result, counter));
  }



  /// *** CONVERSIONS *** ///

  function toRequestIds(bytes32[] memory array)
    internal
    pure
    returns (RequestId[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  function toSlotIds(bytes32[] memory array)
    internal
    pure
    returns (SlotId[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  function toSlotId(RequestId requestId, uint256 slotIndex)
    internal
    pure
    returns (SlotId)
  {
    return SlotId.wrap(keccak256(abi.encode(requestId, slotIndex)));
  }

  /// *** COMPARISONS *** ///

  function isDefault(RequestId requestId) internal pure returns (bool) {
    return equals(requestId, RequestId.wrap(0));
  }

  function _isDefault(SlotId slotId) private pure returns (bool) {
    return equals(slotId, SlotId.wrap(0));
  }

  function _isDefault(address addr) private pure returns (bool) {
    return addr == address(0);
  }

  function _isDefault (ClientId clientId) private pure returns (bool) {
    return _isDefault(ClientId.unwrap(clientId));
  }

  function _isDefault (HostId hostId) private pure returns (bool) {
    return _isDefault(HostId.unwrap(hostId));
  }

  function equals(RequestId a, RequestId b) internal pure returns (bool) {
    return RequestId.unwrap(a) == RequestId.unwrap(b);
  }

  function equals(SlotId a, SlotId b) internal pure returns (bool) {
    return SlotId.unwrap(a) == SlotId.unwrap(b);
  }
}
