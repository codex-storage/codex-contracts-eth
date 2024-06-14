methods {
  function totalReceived() external returns (uint) envfree;
  function totalSent() external returns (uint) envfree;
  function tokenBalance() external returns (uint) envfree;
}

rule sanity(env e, method f) {
    calldataarg args;
    f(e, args);
    satisfy true;
}

rule totalReceivedCannotDecrease(env e, method f) {
  mathint total_before = totalReceived();

  calldataarg args;
  f(e, args);

  mathint total_after = totalReceived();

  assert total_after >= total_before;
}

rule totalSentCannotDecrease(env e, method f) {
  mathint total_before = totalSent();

  calldataarg args;
  f(e, args);

  mathint total_after = totalSent();

  assert total_after >= total_before;
}
