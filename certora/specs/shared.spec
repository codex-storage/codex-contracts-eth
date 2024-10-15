ghost mapping(MarketplaceHarness.SlotId => MarketplaceHarness.RequestId) slotIdToRequestId;

hook Sload Marketplace.RequestId defaultValue _slots[KEY MarketplaceHarness.SlotId SlotId].requestId {
    require slotIdToRequestId[SlotId] == defaultValue;
}

hook Sstore _slots[KEY MarketplaceHarness.SlotId SlotId].requestId Marketplace.RequestId defaultValue {
    slotIdToRequestId[SlotId] = defaultValue;
}

function ensureValidRequestId(Marketplace.RequestId requestId) {
    // Without this, the prover will find counter examples with `requestId == 0`,
    // which are unlikely in practice as `requestId` is a hash from a request object.
    // However, `requestId == 0` enforces `SlotState.Free` in the `fillSlot` function regardless,
    // which ultimately results in counter examples where we have a state change
    // RequestState.Finished -> RequestState.Started, which is forbidden.
    //
    // COUNTER EXAMPLE: https://prover.certora.com/output/6199/81939b2b12d74a5cae5e84ceadb901c0?anonymousKey=a4ad6268598a1077ecfce75493b0c0f9bc3b17a0
    //
    // The `require` below is a hack to ensure we exclude such cases as the code
    // reverts in `requestIsKnown()` modifier (simply `require requestId != 0` isn't
    // sufficient here)
    // require requestId == to_bytes32(0) => currentContract._requests[requestId].client == 0;
    require requestId != to_bytes32(0) && currentContract._requests[requestId].client != 0;
}

// STATUS - verified
// cancelled slot always belongs to cancelled request
// https://prover.certora.com/output/6199/80d5dc73d406436db166071e277283f1?anonymousKey=d5d175960dc40f72e22ba8e31c6904a488277e57
invariant cancelledSlotAlwaysHasCancelledRequest(env e, Marketplace.SlotId slotId)
    currentContract.slotState(e, slotId) == Marketplace.SlotState.Cancelled =>
        currentContract.requestState(e, slotIdToRequestId[slotId]) == Marketplace.RequestState.Cancelled;

// STATUS - verified
// finished slot always has finished request
// https://prover.certora.com/output/6199/3371ee4f80354ac9b05b1c84c53b6154?anonymousKey=eab83785acb61ccd31ed0c9d5a2e9e2b24099156
invariant finishedSlotAlwaysHasFinishedRequest(env e, Marketplace.SlotId slotId)
    currentContract.slotState(e, slotId) == Marketplace.SlotState.Finished =>
        currentContract.requestState(e, slotIdToRequestId[slotId]) == Marketplace.RequestState.Finished;

