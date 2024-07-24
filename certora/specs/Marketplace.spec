using ERC20A as Token;

/*--------------------------------------------
|              Ghosts and hooks              |
--------------------------------------------*/

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
