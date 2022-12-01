// SPDX-License-Identifier: MIT
// inspired by: https://bitbucket.org/rhitchens2/soliditystoragepatterns/src/master/OneToMany.sol
pragma solidity ^0.8.8;

import "./EnumerableSetExtensions.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Utils.sol";

library DAL {

  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableSetExtensions for EnumerableSetExtensions.ClearableBytes32Set;

  type RequestId is bytes32;
  type SlotId is bytes32;

  struct Client {
    address addr; // PK

    EnumerableSetExtensions.ClearableBytes32Set activeRequests;
  }

  struct Host {
    address addr; // PK

    EnumerableSetExtensions.ClearableBytes32Set activeSlots;
    EnumerableSetExtensions.ClearableBytes32Set activeRequests;
  }

  struct Request {
    RequestId id;
    address client;
    Ask ask;
    Content content;
    uint256 expiry; // time at which this request expires
    bytes32 nonce; // random nonce to differentiate between similar requests

    EnumerableSetExtensions.ClearableBytes32Set slots;
  }

  struct Slot {
    SlotId id;
    address host;
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
    mapping(address => Client) clients;
    mapping(address => Host) hosts;
  }



  /// *** CREATE OPERATIONS *** ///

  function insertRequest(Database storage db,
                         RequestId requestId,
                         address client,
                         Ask memory ask,
                         Content memory content,
                         uint256 expiry,
                         bytes32 nonce)
    internal
    returns (DAL.Request storage)
  {
    require(clientExists(db, client), "client does not exist");
    require(!exists(db, requestId), "request already exists");

    Request storage r = db.requests[requestId];
    r.id = requestId;
    r.client = client;
    r.ask = ask;
    r.content = content;
    r.expiry = expiry;
    r.nonce = nonce;
    return r;
  }

  function insertClient(Database storage db, address client) internal {
    // NOTE: by default db.clients[client].activeRequests already exists but has a default value
    db.clients[client].addr = client;
  }

  function insertHost(Database storage db, address host) internal {
    // NOTE: by default db.hosts[host].activeSlots already exists but has a default value
    db.hosts[host].addr = host;
  }

  function insertSlot(Database storage db, Slot memory slot) internal {
    require(exists(db, slot.requestId), "request does not exist");
    require(!exists(db, slot.id), "slot already exists");
    require(hostExists(db, slot.host), "host does not exist");
    db.slots[slot.id] = slot;

    Request storage request = db.requests[slot.requestId];
    request.slots.add(SlotId.unwrap(slot.id));
  }

  function insertActiveRequestForClient(Database storage db,
                                     RequestId requestId)
    internal
  {
    require(exists(db, requestId), "request does not exist");
    Request storage request = db.requests[requestId];
    require(clientExists(db, request.client), "client does not exist");

    Client storage client = db.clients[request.client];
    client.activeRequests.add(RequestId.unwrap(requestId));
  }
  function insertActiveRequestForHost(Database storage db,
                                   address host,
                                   RequestId requestId)
    internal
  {
    require(exists(db, requestId), "request does not exist");
    require(hostExists(db, host), "host does not exist");

    Host storage h = db.hosts[host];
    h.activeRequests.add(RequestId.unwrap(requestId));
  }

  function insertActiveSlotForHost(Database storage db, SlotId slotId)
    internal
  {
    require(exists(db, slotId), "slot does not exist");
    Slot storage slot = db.slots[slotId];
    require(hostExists(db, slot.host), "host does not exist");
    Host storage host = db.hosts[slot.host];
    require(host.activeRequests.contains(RequestId.unwrap(slot.requestId)),
      "slot request not active");

    host.activeSlots.add(SlotId.unwrap(slotId));
  }



  /// *** READ OPERATIONS *** ///

  function selectRequest(Database storage db, RequestId requestId)
    internal
    view
    returns (Request storage)
  {
    require(exists(db, requestId), "Unknown request");
    return db.requests[requestId];
  }

  function selectSlot(Database storage db, SlotId slotId)
    internal
    view
    returns (Slot storage)
  {
    require(exists(db, slotId), "Slot empty");
    return db.slots[slotId];
  }

  function selectClient(Database storage db, address addr)
    internal
    view
    returns (Client storage)
  {
    require(clientExists(db, addr), "Client does not exist");
    return db.clients[addr];
  }

  function selectHost(Database storage db, address addr)
    internal
    view
    returns (Host storage)
  {
    require(hostExists(db, addr), "Host does not exist");
    return db.hosts[addr];
  }

  function exists(Database storage db, RequestId requestId)
    internal
    view
    returns (bool)
  {
    return db.requests[requestId].client != address(0);
  }

  function exists(Database storage db, SlotId slotId)
    internal
    view
    returns (bool)
  {
    return !isDefault(db.slots[slotId].requestId);
  }

  function clientExists(Database storage db, address client)
    internal
    view
    returns (bool)
  {
    return db.clients[client].addr != address(0);
  }

  function hostExists(Database storage db, address host)
    internal
    view
    returns (bool)
  {
    return db.hosts[host].addr != address(0);
  }




  /// *** DELETE OPERATIONS *** ///

  function deleteRequest(Database storage db, RequestId requestId) internal {
    require(exists(db, requestId), "request does not exist");
    Request storage request = db.requests[requestId];
    require(request.slots.length() == 0, "references slots");
    require(clientExists(db, request.client), "client does not exist");
    Client storage client = db.clients[request.client];
    bytes32 bRequestId = RequestId.unwrap(requestId);
    require(!client.activeRequests.contains(bRequestId), "active request refs");

    delete db.requests[requestId];
  }

  function deleteClient(Database storage db, address addr) internal {
    require(clientExists(db, addr), "client does not exist");
    Client storage c = db.clients[addr];
    require(c.activeRequests.length() == 0, "active request refs");

    delete db.clients[addr];
  }

  function deleteHost(Database storage db, address addr) internal {
    require(hostExists(db, addr), "host does not exist");
    Host storage h = db.hosts[addr];
    require(h.activeSlots.length() == 0, "active slot refs");

    delete db.hosts[addr];
  }

  function deleteSlot(Database storage db, SlotId slotId) internal {
    require(exists(db, slotId), "slot does not exist");
    Slot storage slot = db.slots[slotId];
    require(exists(db, slot.requestId), "request does not exist");
    Host storage host = db.hosts[slot.host];
    bytes32 bSlotId = SlotId.unwrap(slotId);
    require(!host.activeSlots.contains(bSlotId), "active slot refs");

    Request storage request = db.requests[slot.requestId];
    request.slots.remove(bSlotId);
    delete db.slots[slotId];
  }

  function deleteActiveRequestForClient(Database storage db,
                                        RequestId requestId)
    internal
  {
    require(exists(db, requestId), "request does not exist");
    Request storage request = db.requests[requestId];
    require(clientExists(db, request.client), "client does not exist");

    Client storage client = db.clients[request.client];
    client.activeRequests.remove(RequestId.unwrap(requestId));
  }

  function deleteActiveRequestForHost(Database storage db,
                                      address host,
                                      RequestId requestId)
    internal
  {
    require(exists(db, requestId), "request does not exist");
    require(hostExists(db, host), "host does not exist");
    // NOTE: we are not enforcing relationship integrity with
    // host.activeRequests as a workaround to avoid iterating all activeSlots
    // and removing them. The result of this is that there may
    // exist "dangling" host.activeSlots that do not have a corresponding
    // activeRequest, which should be considered when reading the values.
    // Because of this, a join between activeSlots and activeRequests should be
    // performed to get an accurate picture, as in `activeSlotsForHost`.

    Host storage h = db.hosts[host];
    h.activeRequests.remove(RequestId.unwrap(requestId));
  }

  function deleteActiveSlotForHost(Database storage db,
                                SlotId slotId)
    internal
    returns (bool success)
  {
    require(exists(db, slotId), "slot does not exist");
    Slot storage slot = db.slots[slotId];
    require(hostExists(db, slot.host), "host does not exist");

    Host storage host = db.hosts[slot.host];
    success = host.activeSlots.remove(SlotId.unwrap(slotId));
  }



  /// CALCULATED PROPERTIES

  // WARNING: calling this in a transaction may cause an out of gas exception
  function activeSlotsForHost(Database storage db, Host storage host)
    internal
    view
    returns (SlotId[] memory)
  {
    bytes32[] memory result = new bytes32[](host.activeSlots.length());
    uint256 counter = 0;
    for (uint256 i = 0; i < host.activeSlots.length(); i++) {
      bytes32 slotId = host.activeSlots.at(i);
      Slot storage slot = selectSlot(db, SlotId.wrap(slotId));
      if (host.activeRequests.contains(RequestId.unwrap(slot.requestId))) {
        result[counter] = slotId;
        counter++;
      }
    }
    return toSlotIds(Utils.resize(result, counter));
  }

  /// CONVERSIONS

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

  /// COMPARISONS
  function isDefault(RequestId requestId) internal pure returns (bool) {
    return equals(requestId, RequestId.wrap(0));
  }
  function equals(RequestId a, RequestId b) internal pure returns (bool) {
    return RequestId.unwrap(a) == RequestId.unwrap(b);
  }
}
