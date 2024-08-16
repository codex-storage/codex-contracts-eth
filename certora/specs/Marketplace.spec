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

hook Sload bool defaultValue _missing[KEY MarketplaceHarness.SlotId slotId][KEY Periods.Period period] {
    require _missingMirror[slotId][period] == defaultValue;
}

hook Sstore _missing[KEY MarketplaceHarness.SlotId slotId][KEY Periods.Period period] bool defaultValue {
    _missingMirror[slotId][period] = defaultValue;
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
    return f.selector == sig:fillSlot(Marketplace.RequestId, uint256, Marketplace.Groth16Proof).selector ||
        f.selector == sig:freeSlot(Marketplace.SlotId).selector;
}

function canFinishRequest(method f) returns bool {
    return f.selector == sig:freeSlot(Marketplace.SlotId).selector;
}

function canFailRequest(method f) returns bool {
    return f.selector == sig:markProofAsMissing(Marketplace.SlotId, Periods.Period).selector || 
        f.selector == sig:freeSlot(Marketplace.SlotId).selector;
}

/*--------------------------------------------
|                 Invariants                 |
--------------------------------------------*/

invariant totalSupplyIsSumOfBalances()
    to_mathint(Token.totalSupply()) == sumOfBalances;

invariant requestStartedWhenSlotsFilled(env e, Marketplace.RequestId requestId, Marketplace.SlotId slotId)
    currentContract.requestState(e, requestId) == Marketplace.RequestState.Started => to_mathint(currentContract.getRequest(e, requestId).ask.slots) - to_mathint(currentContract.requestContext(e, requestId).slotsFilled) <= to_mathint(currentContract.getRequest(e, requestId).ask.maxSlotLoss);
//     { preserved {
//         require to_mathint(currentContract.requestContext(e, requestId).slotsFilled) <= to_mathint(currentContract.getRequest(e, requestId).ask.slots);
//     }
// }

// STATUS - verified
// can set missing if period was passed
// https://prover.certora.com/output/3106/026b36c118e44ad0824a51c50647c497/?anonymousKey=29879706f3d343555bb6122d071c9409d4e9876d
invariant cantBeMissedIfInPeriod(MarketplaceHarness.SlotId slotId, Periods.Period period)
    lastBlockTimestampGhost <= publicPeriodEnd(period) => !_missingMirror[slotId][period];

// STATUS - verified
// cancelled request is always expired
// https://prover.certora.com/output/6199/df88c16b9fb144ec88292df2346adb21?anonymousKey=2c76bd226b246bdd1b667d16c387519beaf94487
invariant cancelledRequestAlwaysExpired(env e, Marketplace.RequestId requestId)
    currentContract.requestState(e, requestId) == Marketplace.RequestState.Cancelled => 
        currentContract.requestExpiry(e, requestId) < lastBlockTimestampGhost;

// STATUS - verified
// failed request is always ended
// https://prover.certora.com/output/6199/902ffe4a83a9438e9860655446b46a74?anonymousKey=47b344024bbfe84a649bd1de44d7d243ce8dbc21
invariant failedRequestAlwaysEnded(env e, Marketplace.RequestId requestId)
    currentContract.requestState(e, requestId) == Marketplace.RequestState.Failed => 
        currentContract.requestContext(e, requestId).endsAt < lastBlockTimestampGhost;

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

//rule slotFilledIFRequestIsFailed(env e, method f) {
//    calldataarg args;
//    Marketplace.SlotId slotId;
//
//    require currentContract.requestState(e, currentContract.slots(slotId).requestId) != Marketplace.RequestState.Failed;
//    f(e, args);
//    require currentContract.requestState(e, currentContract.slots(slotId).requestId) == Marketplace.RequestState.Failed;
//
//    assert currentContract.slotState(slotId) == Marketplace.SlotState.Failed;
//}


rule allowedRequestStateChanges(env e, method f) {
    calldataarg args;
    Marketplace.RequestId requestId;

    //requireInvariant cancelledRequestAlwaysExpired(e, requestId);
    // requireInvariant failedRequestAlwaysEnded(e, requestId);
    //require currentContract.requestContext(e, requestId).expiresAt < currentContract.requestContext(e, requestId).endsAt;

    // require currentContract.slotState(e, slotId) == Marketplace.SlotState.Finished => currentContract.requestState(e, requestId) == Marketplace.RequestState.Finished;

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

    // RequestState.New -> RequestState.Cancelled
    assert requestStateBefore == Marketplace.RequestState.New && requestStateAfter == Marketplace.RequestState.Cancelled => canCancelRequest(f);

    // RequestState.Started -> RequestState.Finished
    assert requestStateBefore == Marketplace.RequestState.Started && requestStateAfter == Marketplace.RequestState.Finished => canFinishRequest(f);

    // RequestState.Started -> RequestState.Failed
    assert requestStateBefore == Marketplace.RequestState.Started && requestStateAfter == Marketplace.RequestState.Failed => canFailRequest(f);

    // RequestState.Finished -> RequestState.Started
    assert requestStateBefore == Marketplace.RequestState.Finished && requestStateAfter == Marketplace.RequestState.Started => canStartRequest(f);
}

rule cancelledRequestsStayCancelled(env e, method f) {

    calldataarg args;
    Marketplace.RequestId requestId;

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);

    require requestStateBefore == Marketplace.RequestState.Cancelled;
    requireInvariant cancelledRequestAlwaysExpired(e, requestId);

    f(e, args);
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    assert requestStateAfter == requestStateBefore;
}

rule finishedRequestsStayFinished(env e, method f) {

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

rule requestContextStateCanChangeToFailedOnlyWhenSlotIsFilled(env e, method f) {
    calldataarg args;
    Marketplace.SlotId slotId;
    Marketplace.RequestId requestId = currentContract.slots(e, slotId).requestId;

    // check only cases where the request is not already failed
    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);
    require requestStateBefore != Marketplace.RequestState.Failed;

    Marketplace.SlotState slotComputedStateBefore = currentContract.slotState(e, slotId);
    require slotComputedStateBefore != Marketplace.SlotState.Failed &&
            slotComputedStateBefore != Marketplace.SlotState.Cancelled &&
            slotComputedStateBefore != Marketplace.SlotState.Finished;

    f(e, args);

    // check if the slotState function returns Failed (the actual storage variable won't be failed)
    assert currentContract.slotState(e, slotId) == Marketplace.SlotState.Failed => slotComputedStateBefore == Marketplace.SlotState.Filled;
    //assert currentContract.slotState(e, slotId) == Marketplace.SlotState.Failed => currentContract.requestState(e, requestId) == Marketplace.RequestState.Failed;
    //assert currentContract.slotState(e, slotId) == Marketplace.SlotState.Failed => currentContract.requestContext(e, requestId).state == Marketplace.RequestState.Failed;
}
