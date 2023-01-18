// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

type RequestId is bytes32;
type SlotId is bytes32;

struct Request {
  address client;
  Ask ask;
  Content content;
  uint256 expiry; // time at which this request expires
  bytes32 nonce; // random nonce to differentiate between similar requests
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

enum RequestState {
  New, // [default] waiting to fill slots
  Started, // all slots filled, accepting regular proofs
  Cancelled, // not enough slots filled before expiry
  Finished, // successfully completed
  Failed // too many nodes have failed to provide proofs, data lost
}

enum SlotState {
  Free, // [default] not filled yet, or host has vacated the slot
  Filled, // host has filled slot
  Finished, // successfully completed
  Failed, // the request has failed
  Paid // host has been paid
}

library Requests {
  function id(Request memory request) internal pure returns (RequestId) {
    return RequestId.wrap(keccak256(abi.encode(request)));
  }

  function slotId(
    RequestId requestId,
    uint256 slotIndex
  ) internal pure returns (SlotId) {
    return SlotId.wrap(keccak256(abi.encode(requestId, slotIndex)));
  }

  function toRequestIds(
    bytes32[] memory ids
  ) internal pure returns (RequestId[] memory result) {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := ids
    }
  }

  function toSlotIds(
    bytes32[] memory ids
  ) internal pure returns (SlotId[] memory result) {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := ids
    }
  }

  function pricePerSlot(
    Request memory request
  ) internal pure returns (uint256) {
    return request.ask.duration * request.ask.reward;
  }

  function price(Request memory request) internal pure returns (uint256) {
    return request.ask.slots * pricePerSlot(request);
  }
}
