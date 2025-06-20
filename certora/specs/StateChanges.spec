import "./shared.spec";

rule allowedRequestStateChanges(env e, method f) {
    calldataarg args;
    Marketplace.SlotId slotId;

    Marketplace.RequestId requestId = slotIdToRequestId[slotId];

    // needed, otherwise it finds counter examples where
    // `SlotState.Cancelled` and `RequestState.New`
    requireInvariant cancelledSlotAlwaysHasCancelledRequest(e, slotId);
    // needed, otherwise it finds counter example where
    // `SlotState.Finished` and `RequestState.New`
    requireInvariant finishedSlotAlwaysHasFinishedRequest(e, slotId);

    ensureValidRequestId(requestId);

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);

    // we need to check for `freeSlot(slotId)` here to ensure it's being called with
    // the slotId we're interested in and not any other slotId (that may not pass the
    // required invariants)
    if (f.selector == sig:freeSlot(Marketplace.SlotId).selector) {
        freeSlot(e, slotId);
    } else {
        f(e, args);
    }
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    // RequestState.New -> RequestState.Started
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Started => requestStateBefore == Marketplace.RequestState.New;

    // RequestState.Started -> RequestState.Finished
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Finished => requestStateBefore == Marketplace.RequestState.Started;

    // RequestState.Started -> RequestState.Failed
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Failed => requestStateBefore == Marketplace.RequestState.Started;

    // RequestState.New -> RequestState.Cancelled
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Cancelled => requestStateBefore == Marketplace.RequestState.New;
}

