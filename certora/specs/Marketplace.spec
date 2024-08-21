using ERC20A as Token;

methods {
    function Token.balanceOf(address) external returns (uint256) envfree;
    function Token.totalSupply() external returns (uint256) envfree;
    function publicPeriodEnd(Periods.Period) external returns (uint256) envfree;
}

/*--------------------------------------------
|              Ghosts and hooks              |
--------------------------------------------*/

ghost mathint sumOfBalances {
    init_state axiom sumOfBalances == 0;
}

hook Sload uint256 balance Token._balances[KEY address addr] {
    require sumOfBalances >= to_mathint(balance);
}

hook Sstore Token._balances[KEY address addr] uint256 newValue (uint256 oldValue) {
    sumOfBalances = sumOfBalances - oldValue + newValue;
}

ghost mathint totalReceived;

hook Sload uint256 defaultValue currentContract._marketplaceTotals.received {
    require totalReceived >= to_mathint(defaultValue);
}

hook Sstore currentContract._marketplaceTotals.received uint256 defaultValue (uint256 defaultValue_old) {
    totalReceived = totalReceived + defaultValue - defaultValue_old;
}

ghost mathint totalSent;

hook Sload uint256 defaultValue currentContract._marketplaceTotals.sent {
    require totalSent >= to_mathint(defaultValue);
}

hook Sstore currentContract._marketplaceTotals.sent uint256 defaultValue (uint256 defaultValue_old) {
    totalSent = totalSent + defaultValue - defaultValue_old;
}

ghost uint256 lastBlockTimestampGhost;

hook TIMESTAMP uint v {
    require lastBlockTimestampGhost <= v;
    lastBlockTimestampGhost = v;
}

ghost mapping(MarketplaceHarness.SlotId => mapping(Periods.Period => bool)) _missingMirror {
    init_state axiom forall MarketplaceHarness.SlotId a.
            forall Periods.Period b.
            _missingMirror[a][b] == false;
}

ghost mapping(MarketplaceHarness.SlotId => uint256) _missedMirror {
    init_state axiom forall MarketplaceHarness.SlotId a.
            _missedMirror[a] == 0;
}

ghost mapping(MarketplaceHarness.SlotId => mathint) _missedCalculated {
    init_state axiom forall MarketplaceHarness.SlotId a.
            _missedCalculated[a] == 0;
}

hook Sload bool defaultValue _missing[KEY MarketplaceHarness.SlotId slotId][KEY Periods.Period period] {
    require _missingMirror[slotId][period] == defaultValue;
}

hook Sstore _missing[KEY MarketplaceHarness.SlotId slotId][KEY Periods.Period period] bool defaultValue {
    _missingMirror[slotId][period] = defaultValue;
    if (defaultValue) {
        _missedCalculated[slotId] = _missedCalculated[slotId] + 1;
    }
}

hook Sload uint256 defaultValue _missed[KEY MarketplaceHarness.SlotId slotId] {
    require _missedMirror[slotId] == defaultValue;
}

hook Sstore _missed[KEY MarketplaceHarness.SlotId slotId] uint256 defaultValue {
    _missedMirror[slotId] = defaultValue;
    if (defaultValue == 0) {
        _missedCalculated[slotId] = 0;
    }
}

ghost mathint requestStateChangesCount {
    init_state axiom requestStateChangesCount == 0;
}

hook Sstore _requestContexts[KEY Marketplace.RequestId requestId].state Marketplace.RequestState newState (Marketplace.RequestState oldState) {
    if (oldState != newState) {
        requestStateChangesCount = requestStateChangesCount + 1;
    }
}

ghost mathint slotStateChangesCount {
    init_state axiom slotStateChangesCount == 0;
}

hook Sstore _slots[KEY Marketplace.SlotId slotId].state Marketplace.SlotState newState (Marketplace.SlotState oldState) {
    if (oldState != newState) {
        slotStateChangesCount = slotStateChangesCount + 1;
    }
}

/*--------------------------------------------
|              Helper functions              |
--------------------------------------------*/

function canCancelRequest(method f) returns bool {
    return f.selector == sig:withdrawFunds(Marketplace.RequestId).selector;
}

function canStartRequest(method f) returns bool {
    return f.selector == sig:fillSlot(Marketplace.RequestId, uint256, Marketplace.Groth16Proof).selector;
}

function canFinishRequest(method f) returns bool {
    return f.selector == sig:freeSlot(Marketplace.SlotId, address, address).selector;
}

function canFailRequest(method f) returns bool {
    return f.selector == sig:markProofAsMissing(Marketplace.SlotId, Periods.Period).selector ||
        f.selector == sig:freeSlot(Marketplace.SlotId, address, address).selector;
}

/*--------------------------------------------
|                 Invariants                 |
--------------------------------------------*/

invariant totalSupplyIsSumOfBalances()
    to_mathint(Token.totalSupply()) == sumOfBalances;

invariant requestStartedWhenSlotsFilled(env e, Marketplace.RequestId requestId, Marketplace.SlotId slotId)
    to_mathint(currentContract.requestContext(e, requestId).slotsFilled) == to_mathint(currentContract.getRequest(e, requestId).ask.slots) => currentContract.requestState(e, requestId) == Marketplace.RequestState.Started;

// STATUS - verified
// https://prover.certora.com/output/6199/6e2383ea040347eabeeb1008bc257ae6?anonymousKey=e1a6a00310a44ed264b1f98b03fa29273e68fca9
invariant slotMissedShouldBeEqualToNumberOfMissedPeriods(env e, Marketplace.SlotId slotId)
    to_mathint(_missedMirror[slotId]) == _missedCalculated[slotId];

// STATUS - verified
// can set missing if period was passed
// https://prover.certora.com/output/3106/026b36c118e44ad0824a51c50647c497/?anonymousKey=29879706f3d343555bb6122d071c9409d4e9876d
invariant cantBeMissedIfInPeriod(MarketplaceHarness.SlotId slotId, Periods.Period period)
    lastBlockTimestampGhost <= publicPeriodEnd(period) => !_missingMirror[slotId][period];

// STATUS - verified
// cancelled request is always expired
// https://prover.certora.com/output/6199/36b12b897f3941faa00fb4ab6871be8e?anonymousKey=de98a02041b841fb2fa67af4222f29fac258249f
invariant cancelledRequestAlwaysExpired(env e, Marketplace.RequestId requestId)
    currentContract.requestState(e, requestId) == Marketplace.RequestState.Cancelled =>
        currentContract.requestExpiry(e, requestId) < lastBlockTimestampGhost;

// STATUS - verified
// failed request is always ended
// https://prover.certora.com/output/6199/902ffe4a83a9438e9860655446b46a74?anonymousKey=47b344024bbfe84a649bd1de44d7d243ce8dbc21
invariant failedRequestAlwaysEnded(env e, Marketplace.RequestId requestId)
    currentContract.requestState(e, requestId) == Marketplace.RequestState.Failed =>
        currentContract.requestContext(e, requestId).endsAt < lastBlockTimestampGhost;

// STATUS - verified
// finished slot always has finished request
// https://prover.certora.com/output/6199/3371ee4f80354ac9b05b1c84c53b6154?anonymousKey=eab83785acb61ccd31ed0c9d5a2e9e2b24099156
invariant finishedSlotAlwaysHasFinishedRequest(env e, Marketplace.SlotId slotId)
    currentContract.slotState(e, slotId) == Marketplace.SlotState.Finished =>
        currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Finished;

// STATUS - verified
// paid slot always has finished or cancelled request
// https://prover.certora.com/output/6199/6217a927ff2c43bea1124f6ae54a78fb?anonymousKey=d5e09d0d12658fd6b5f298fc04cea88da892c62d
invariant paidSlotAlwaysHasFinishedOrCancelledRequest(env e, Marketplace.SlotId slotId)
     currentContract.slotState(e, slotId) == Marketplace.SlotState.Paid =>
         currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Finished || currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Cancelled
    { preserved {
        // ensures we start with a paid slot
        require currentContract.slotState(e, slotId) == Marketplace.SlotState.Paid;
      }
    }

// STATUS - verified
// cancelled slot always belongs to cancelled request
// https://prover.certora.com/output/6199/80d5dc73d406436db166071e277283f1?anonymousKey=d5d175960dc40f72e22ba8e31c6904a488277e57
invariant cancelledSlotAlwaysHasCancelledRequest(env e, Marketplace.SlotId slotId)
    currentContract.slotState(e, slotId) == Marketplace.SlotState.Cancelled =>
        currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Cancelled;

/*--------------------------------------------
|                 Properties                 |
--------------------------------------------*/

rule sanity(env e, method f) {
    calldataarg args;
    f(e, args);
    assert true;
    satisfy true;
}

rule totalReceivedCannotDecrease(env e, method f) {
    mathint total_before = totalReceived;

    calldataarg args;
    f(e, args);

    mathint total_after = totalReceived;

    assert total_after >= total_before;
}

rule totalSentCannotDecrease(env e, method f) {
    mathint total_before = totalSent;

    calldataarg args;
    f(e, args);

    mathint total_after = totalSent;

    assert total_after >= total_before;
}

rule slotIsFailedOrFreeIfRequestHasFailed(env e, method f) {
    calldataarg args;
    Marketplace.SlotId slotId;

    requireInvariant paidSlotAlwaysHasFinishedOrCancelledRequest(e, slotId);

    require currentContract.requestState(e, currentContract.slots(e, slotId).requestId) != Marketplace.RequestState.Failed;
    f(e, args);
    require currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Failed;

    assert currentContract.slotState(e, slotId) == Marketplace.SlotState.Failed ||
        currentContract.slotState(e, slotId) == Marketplace.SlotState.Free;
}


rule allowedRequestStateChanges(env e, method f) {
    calldataarg args;
    Marketplace.RequestId requestId;

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);
    f(e, args);
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Started => requestStateBefore == Marketplace.RequestState.New;
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Finished => requestStateBefore == Marketplace.RequestState.Started;
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Failed => requestStateBefore == Marketplace.RequestState.Started;
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Cancelled => requestStateBefore == Marketplace.RequestState.New;
}

rule functionsCausingRequestStateChanges(env e, method f) {
    calldataarg args;
    Marketplace.RequestId requestId;

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);
    f(e, args);
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    // RequestState.New -> RequestState.Started
    assert requestStateBefore == Marketplace.RequestState.New && requestStateAfter == Marketplace.RequestState.Started => canStartRequest(f);

    // RequestState.Started -> RequestState.Finished
    assert requestStateBefore == Marketplace.RequestState.Started && requestStateAfter == Marketplace.RequestState.Finished => canFinishRequest(f);

    // RequestState.Started -> RequestState.Failed
    assert requestStateBefore == Marketplace.RequestState.Started && requestStateAfter == Marketplace.RequestState.Failed => canFailRequest(f);

    // RequestState.New -> RequestState.Cancelled
    assert requestStateBefore == Marketplace.RequestState.New && requestStateAfter == Marketplace.RequestState.Cancelled => canCancelRequest(f);
}

rule finishedRequestCannotBeStartedAgain(env e, method f) {

    calldataarg args;
    Marketplace.RequestId requestId;

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);
    require requestStateBefore == Marketplace.RequestState.Finished;
    f(e, args);
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    assert requestStateBefore == requestStateAfter;
}

rule requestStateChangesOnlyOncePerFunctionCall(env e, method f) {
    calldataarg args;
    Marketplace.RequestId requestId;

    mathint requestStateChangesCountBefore = requestStateChangesCount;
    f(e, args);
    mathint requestStateChangesCountAfter = requestStateChangesCount;

    assert requestStateChangesCountAfter <= requestStateChangesCountBefore + 1;
}

rule slotStateChangesOnlyOncePerFunctionCall(env e, method f) {
    calldataarg args;
    Marketplace.SlotId slotId;

    mathint slotStateChangesCountBefore = slotStateChangesCount;
    f(e, args);
    mathint slotStateChangesCountAfter =slotStateChangesCount;

    assert slotStateChangesCountAfter <= slotStateChangesCountBefore + 1;
}
