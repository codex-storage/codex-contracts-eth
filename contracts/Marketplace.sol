// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Vault.sol";
import "./Configuration.sol";
import "./Requests.sol";
import "./Proofs.sol";
import "./SlotReservations.sol";
import "./StateRetrieval.sol";
import "./Endian.sol";
import "./Groth16.sol";
import "./marketplace/VaultHelpers.sol";
import "./marketplace/Collateral.sol";

contract Marketplace is SlotReservations, Proofs, StateRetrieval, Endian {
  error Marketplace_InvalidExpiry();
  error Marketplace_InvalidMaxSlotLoss();
  error Marketplace_InsufficientSlots();
  error Marketplace_InsufficientDuration();
  error Marketplace_InsufficientProofProbability();
  error Marketplace_InsufficientCollateral();
  error Marketplace_InsufficientReward();
  error Marketplace_InvalidClientAddress();
  error Marketplace_RequestAlreadyExists();
  error Marketplace_InvalidSlot();
  error Marketplace_InvalidCid();
  error Marketplace_SlotNotFree();
  error Marketplace_InvalidSlotHost();
  error Marketplace_AlreadyPaid();
  error Marketplace_UnknownRequest();
  error Marketplace_InvalidState();
  error Marketplace_StartNotBeforeExpiry();
  error Marketplace_SlotNotAcceptingProofs();
  error Marketplace_ProofNotSubmittedByHost();
  error Marketplace_SlotIsFree();
  error Marketplace_ReservationRequired();
  error Marketplace_DurationExceedsLimit();

  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.AddressSet;
  using Requests for Request;
  using AskHelpers for Ask;
  using VaultHelpers for Vault;
  using VaultHelpers for RequestId;
  using VaultHelpers for Request;
  using Collateral for Request;
  using Collateral for CollateralConfig;
  using Timestamps for Timestamp;
  using Tokens for TokensPerSecond;

  Vault private immutable _vault;
  MarketplaceConfig private _config;

  mapping(RequestId => Request) private _requests;
  mapping(RequestId => RequestContext) internal _requestContexts;
  mapping(SlotId => Slot) internal _slots;

  struct RequestContext {
    RequestState state;
    uint64 slotsFilled;
    Timestamp startedAt;
    Timestamp endsAt;
    Timestamp expiresAt;
  }

  struct Slot {
    SlotState state;
    RequestId requestId;
    /// @notice Timestamp that signals when slot was filled
    /// @dev Used for calculating payouts as hosts are paid
    ///      based on time they actually host the content
    Timestamp filledAt;
    uint64 slotIndex;
    /// @notice address used for collateral interactions and identifying hosts
    address host;
  }

  struct ActiveSlot {
    Request request;
    uint64 slotIndex;
  }

  constructor(
    MarketplaceConfig memory config,
    Vault vault_,
    IGroth16Verifier verifier
  ) SlotReservations(config.reservations) Proofs(config.proofs, verifier) {
    _vault = vault_;
    config.collateral.checkCorrectness();
    _config = config;
  }

  function configuration() public view returns (MarketplaceConfig memory) {
    return _config;
  }

  function token() public view returns (IERC20) {
    return _vault.getToken();
  }

  function vault() public view returns (Vault) {
    return _vault;
  }

  function requestStorage(Request calldata request) public {
    RequestId id = request.id();

    if (request.client != msg.sender) revert Marketplace_InvalidClientAddress();
    if (_requests[id].client != address(0)) {
      revert Marketplace_RequestAlreadyExists();
    }
    if (
      request.expiry == Duration.wrap(0) ||
      request.expiry >= request.ask.duration
    ) revert Marketplace_InvalidExpiry();
    if (request.ask.slots == 0) revert Marketplace_InsufficientSlots();
    if (request.ask.maxSlotLoss > request.ask.slots)
      revert Marketplace_InvalidMaxSlotLoss();
    if (request.ask.duration == Duration.wrap(0)) {
      revert Marketplace_InsufficientDuration();
    }
    if (request.ask.proofProbability == 0) {
      revert Marketplace_InsufficientProofProbability();
    }
    if (request.ask.collateralPerByte == 0) {
      revert Marketplace_InsufficientCollateral();
    }
    if (request.ask.pricePerBytePerSecond == TokensPerSecond.wrap(0)) {
      revert Marketplace_InsufficientReward();
    }
    if (bytes(request.content.cid).length == 0) {
      revert Marketplace_InvalidCid();
    }
    if (request.ask.duration > _config.requestDurationLimit) {
      revert Marketplace_DurationExceedsLimit();
    }

    Timestamp currentTime = Timestamps.currentTime();

    _requests[id] = request;
    _requestContexts[id].endsAt = currentTime.add(request.ask.duration);
    _requestContexts[id].expiresAt = currentTime.add(request.expiry);

    _addToMyRequests(request.client, id);

    FundId fund = id.asFundId();
    AccountId account = _vault.clientAccount(request.client);
    _vault.lock(
      fund,
      _requestContexts[id].expiresAt,
      _requestContexts[id].endsAt
    );
    _transferToVault(request.client, fund, account, request.maxPrice());

    emit StorageRequested(id, request.ask, _requestContexts[id].expiresAt);
  }

  /**
   * @notice Fills a slot. Reverts if an invalid proof of the slot data is
     provided.
   * @param requestId RequestId identifying the request containing the slot to
     fill.
   * @param slotIndex Index of the slot in the request.
   * @param proof Groth16 proof procing possession of the slot data.
   */
  function fillSlot(
    RequestId requestId,
    uint64 slotIndex,
    Groth16Proof calldata proof
  ) public requestIsKnown(requestId) {
    Request storage request = _requests[requestId];
    if (slotIndex >= request.ask.slots) revert Marketplace_InvalidSlot();

    SlotId slotId = Requests.slotId(requestId, slotIndex);

    if (!_reservations[slotId].contains(msg.sender))
      revert Marketplace_ReservationRequired();

    Slot storage slot = _slots[slotId];
    slot.requestId = requestId;
    slot.slotIndex = slotIndex;
    RequestContext storage context = _requestContexts[requestId];

    if (
      slotState(slotId) != SlotState.Free &&
      slotState(slotId) != SlotState.Repair
    ) {
      revert Marketplace_SlotNotFree();
    }

    Timestamp currentTime = Timestamps.currentTime();

    slot.host = msg.sender;
    slot.filledAt = currentTime;

    _startRequiringProofs(slotId);
    submitProof(slotId, proof);

    context.slotsFilled += 1;

    // Collect collateral
    uint128 collateralAmount = request.collateralPerSlot();
    uint128 designatedAmount = _config.collateral.designatedCollateral(
      collateralAmount
    );
    if (slotState(slotId) == SlotState.Repair) {
      // Host is repairing a slot and is entitled for repair reward, so he gets "discounted collateral"
      // in this way he gets "physically" the reward at the end of the request when the full amount of collateral
      // is returned to him.
      collateralAmount -= _config.collateral.repairReward(collateralAmount);
    }

    FundId fund = requestId.asFundId();
    AccountId clientAccount = _vault.clientAccount(request.client);
    AccountId hostAccount = _vault.hostAccount(slot.host, slotIndex);
    TokensPerSecond rate = request.ask.pricePerSlotPerSecond();

    _transferToVault(slot.host, fund, hostAccount, collateralAmount);
    _vault.designate(fund, hostAccount, designatedAmount);
    _vault.flow(fund, clientAccount, hostAccount, rate);

    _addToMySlots(slot.host, slotId);

    slot.state = SlotState.Filled;
    emit SlotFilled(requestId, slotIndex);

    if (
      context.slotsFilled == request.ask.slots &&
      context.state == RequestState.New // Only New requests can "start" the requests
    ) {
      context.state = RequestState.Started;
      context.startedAt = currentTime;
      _vault.extendLock(fund, context.endsAt);
      emit RequestFulfilled(requestId);
    }
  }

  function _transferToVault(
    address from,
    FundId fund,
    AccountId account,
    uint128 amount
  ) private {
    _vault.getToken().safeTransferFrom(from, address(this), amount);
    _vault.getToken().approve(address(_vault), amount);
    _vault.deposit(fund, account, amount);
  }

  /**
     * @notice Frees a slot, paying out rewards and returning collateral for
     finished or cancelled requests to the host that has filled the slot.
   * @param slotId id of the slot to free
   * @dev The host that filled the slot must have initiated the transaction
     (msg.sender).
   */
  function freeSlot(SlotId slotId) public slotIsNotFree(slotId) {
    Slot storage slot = _slots[slotId];
    if (slot.host != msg.sender) revert Marketplace_InvalidSlotHost();

    SlotState state = slotState(slotId);
    if (state == SlotState.Paid) revert Marketplace_AlreadyPaid();

    if (state == SlotState.Finished) {
      _payoutSlot(slot.requestId, slotId);
    } else if (state == SlotState.Cancelled) {
      _payoutCancelledSlot(slot.requestId, slotId);
    } else if (state == SlotState.Failed) {
      _removeFromMySlots(msg.sender, slotId);
    } else if (state == SlotState.Filled) {
      // free slot without returning collateral, effectively a 100% slash
      _forciblyFreeSlot(slotId);
    }
  }

  function _challengeToFieldElement(
    bytes32 challenge
  ) internal pure returns (uint256) {
    // use only 31 bytes of the challenge to ensure that it fits into the field
    bytes32 truncated = bytes32(bytes31(challenge));
    // convert from little endian to big endian
    bytes32 bigEndian = _byteSwap(truncated);
    // convert bytes to integer
    return uint256(bigEndian);
  }

  function _merkleRootToFieldElement(
    bytes32 merkleRoot
  ) internal pure returns (uint256) {
    // convert from little endian to big endian
    bytes32 bigEndian = _byteSwap(merkleRoot);
    // convert bytes to integer
    return uint256(bigEndian);
  }

  function submitProof(
    SlotId id,
    Groth16Proof calldata proof
  ) public requestIsKnown(_slots[id].requestId) {
    Slot storage slot = _slots[id];

    if (msg.sender != slot.host) {
      revert Marketplace_ProofNotSubmittedByHost();
    }

    Request storage request = _requests[slot.requestId];
    uint256[] memory pubSignals = new uint256[](3);
    pubSignals[0] = _challengeToFieldElement(getChallenge(id));
    pubSignals[1] = _merkleRootToFieldElement(request.content.merkleRoot);
    pubSignals[2] = slot.slotIndex;
    _proofReceived(id, proof, pubSignals);
  }

  function canMarkProofAsMissing(
    SlotId slotId,
    Period period
  ) public view slotAcceptsProofs(slotId) {
    _canMarkProofAsMissing(slotId, period);
  }

  function markProofAsMissing(
    SlotId slotId,
    Period period
  ) public slotAcceptsProofs(slotId) {
    _markProofAsMissing(slotId, period);

    Slot storage slot = _slots[slotId];
    Request storage request = _requests[slot.requestId];

    uint128 collateral = request.collateralPerSlot();
    uint128 slashedAmount = _config.collateral.slashAmount(collateral);
    uint128 validatorReward = _config.collateral.validatorReward(slashedAmount);

    FundId fund = slot.requestId.asFundId();
    AccountId hostAccount = _vault.hostAccount(slot.host, slot.slotIndex);
    AccountId validatorAccount = _vault.validatorAccount(msg.sender);
    _vault.transfer(fund, hostAccount, validatorAccount, validatorReward);
    _vault.burnDesignated(fund, hostAccount, slashedAmount - validatorReward);

    if (missingProofs(slotId) >= _config.collateral.maxNumberOfSlashes) {
      // When the number of slashings is at or above the allowed amount,
      // free the slot.
      _forciblyFreeSlot(slotId);
    }
  }

  /// Abandons the slot, burns all associated tokens
  function _forciblyFreeSlot(SlotId slotId) internal {
    Slot storage slot = _slots[slotId];
    RequestId requestId = slot.requestId;
    RequestContext storage context = _requestContexts[requestId];

    Request storage request = _requests[requestId];

    FundId fund = requestId.asFundId();
    AccountId hostAccount = _vault.hostAccount(slot.host, slot.slotIndex);
    AccountId clientAccount = _vault.clientAccount(request.client);
    TokensPerSecond rate = request.ask.pricePerSlotPerSecond();

    _vault.flow(fund, hostAccount, clientAccount, rate);
    _vault.burnAccount(fund, hostAccount);

    _removeFromMySlots(slot.host, slotId);
    _reservations[slotId].clear(); // We purge all the reservations for the slot
    slot.state = SlotState.Repair;
    slot.filledAt = Timestamp.wrap(0);
    slot.host = address(0);
    context.slotsFilled -= 1;
    emit SlotFreed(requestId, slot.slotIndex);
    _resetMissingProofs(slotId);

    uint256 slotsLost = request.ask.slots - context.slotsFilled;
    if (
      slotsLost > request.ask.maxSlotLoss &&
      context.state == RequestState.Started
    ) {
      context.state = RequestState.Failed;
      _vault.freezeFund(fund);

      emit RequestFailed(requestId);
    }
  }

  function _payoutSlot(
    RequestId requestId,
    SlotId slotId
  ) private requestIsKnown(requestId) {
    RequestContext storage context = _requestContexts[requestId];
    Request storage request = _requests[requestId];
    context.state = RequestState.Finished;
    Slot storage slot = _slots[slotId];

    _removeFromMyRequests(request.client, requestId);
    _removeFromMySlots(slot.host, slotId);

    slot.state = SlotState.Paid;
    FundId fund = requestId.asFundId();
    AccountId account = _vault.hostAccount(slot.host, slot.slotIndex);
    _vault.withdraw(fund, account);
  }

  /**
     * @notice Pays out a host for duration of time that the slot was filled, and
     returns the collateral.
   * @param requestId RequestId of the request that contains the slot to be paid
     out.
   * @param slotId SlotId of the slot to be paid out.
   */
  function _payoutCancelledSlot(
    RequestId requestId,
    SlotId slotId
  ) private requestIsKnown(requestId) {
    Slot storage slot = _slots[slotId];
    _removeFromMySlots(slot.host, slotId);
    slot.state = SlotState.Paid;
    FundId fund = requestId.asFundId();
    AccountId account = _vault.hostAccount(slot.host, slot.slotIndex);
    _vault.withdraw(fund, account);
  }

  /// Withdraws remaining storage request funds back to the client that
  function withdrawFunds(RequestId requestId) public requestIsKnown(requestId) {
    FundId fund = requestId.asFundId();
    AccountId account = _vault.clientAccount(msg.sender);
    _vault.withdraw(fund, account);

    _removeFromMyRequests(msg.sender, requestId);
  }

  function withdrawByValidator(RequestId requestId) public {
    FundId fund = requestId.asFundId();
    AccountId account = _vault.validatorAccount(msg.sender);
    _vault.withdraw(fund, account);
  }

  function getActiveSlot(
    SlotId slotId
  ) public view returns (ActiveSlot memory) {
    // Modifier `slotIsNotFree(slotId)` works here, but using the modifier
    // causes hardhat to return an error "reverted with an unrecognized custom
    // error (return data: 0x8b41ec7f)".
    if (_slots[slotId].state == SlotState.Free) revert Marketplace_SlotIsFree();
    Slot storage slot = _slots[slotId];
    ActiveSlot memory activeSlot;
    activeSlot.request = _requests[slot.requestId];
    activeSlot.slotIndex = slot.slotIndex;
    return activeSlot;
  }

  modifier requestIsKnown(RequestId requestId) {
    if (_requests[requestId].client == address(0))
      revert Marketplace_UnknownRequest();

    _;
  }

  function getRequest(
    RequestId requestId
  ) public view requestIsKnown(requestId) returns (Request memory) {
    return _requests[requestId];
  }

  modifier slotIsNotFree(SlotId slotId) {
    if (_slots[slotId].state == SlotState.Free) revert Marketplace_SlotIsFree();
    _;
  }

  modifier slotAcceptsProofs(SlotId slotId) {
    if (slotState(slotId) != SlotState.Filled)
      revert Marketplace_SlotNotAcceptingProofs();
    _;
  }

  function requestEnd(RequestId requestId) public view returns (Timestamp) {
    RequestState state = requestState(requestId);
    if (
      state == RequestState.New ||
      state == RequestState.Started ||
      state == RequestState.Failed
    ) {
      return _requestContexts[requestId].endsAt;
    }
    if (state == RequestState.Cancelled) {
      return _requestContexts[requestId].expiresAt;
    }
    Timestamp currentTime = Timestamps.currentTime();
    Timestamp end = _requestContexts[requestId].endsAt;
    return Timestamps.earliest(end, currentTime);
  }

  function requestExpiry(RequestId requestId) public view returns (Timestamp) {
    return _requestContexts[requestId].expiresAt;
  }

  /**
   * @notice Calculates the amount that should be paid out to a host that successfully finished the request
   * @param requestId RequestId of the request used to calculate the payout
   * amount.
   * @param start timestamp indicating when a host filled a slot and
   * started providing proofs.
   */
  function _slotPayout(
    RequestId requestId,
    Timestamp start
  ) private view returns (uint256) {
    return _slotPayout(requestId, start, _requestContexts[requestId].endsAt);
  }

  /// @notice Calculates the amount that should be paid out to a host based on the specified time frame.
  function _slotPayout(
    RequestId requestId,
    Timestamp start,
    Timestamp end
  ) private view returns (uint256) {
    Request storage request = _requests[requestId];
    if (end <= start) {
      revert Marketplace_StartNotBeforeExpiry();
    }
    return request.ask.pricePerSlotPerSecond().accumulate(start.until(end));
  }

  function getHost(SlotId slotId) public view returns (address) {
    return _slots[slotId].host;
  }

  function requestState(
    RequestId requestId
  ) public view requestIsKnown(requestId) returns (RequestState) {
    RequestContext storage context = _requestContexts[requestId];
    Timestamp currentTime = Timestamps.currentTime();
    if (
      context.state == RequestState.New &&
      requestExpiry(requestId) < currentTime
    ) {
      return RequestState.Cancelled;
    } else if (
      (context.state == RequestState.Started ||
        context.state == RequestState.New) && context.endsAt < currentTime
    ) {
      return RequestState.Finished;
    } else {
      return context.state;
    }
  }

  function slotState(
    SlotId slotId
  ) public view override(Proofs, SlotReservations) returns (SlotState) {
    Slot storage slot = _slots[slotId];
    if (RequestId.unwrap(slot.requestId) == 0) {
      return SlotState.Free;
    }
    RequestState reqState = requestState(slot.requestId);
    if (slot.state == SlotState.Paid) {
      return SlotState.Paid;
    }
    if (reqState == RequestState.Cancelled) {
      return SlotState.Cancelled;
    }
    if (reqState == RequestState.Finished) {
      return SlotState.Finished;
    }
    if (reqState == RequestState.Failed) {
      return SlotState.Failed;
    }
    return slot.state;
  }

  function slotProbability(
    SlotId slotId
  ) public view override returns (uint256) {
    Slot storage slot = _slots[slotId];
    Request storage request = _requests[slot.requestId];
    return
      (request.ask.proofProbability * (256 - _config.proofs.downtime)) / 256;
  }

  event StorageRequested(RequestId requestId, Ask ask, Timestamp expiry);
  event RequestFulfilled(RequestId indexed requestId);
  event RequestFailed(RequestId indexed requestId);
  event SlotFilled(RequestId indexed requestId, uint64 slotIndex);
  event SlotFreed(RequestId indexed requestId, uint64 slotIndex);
}
