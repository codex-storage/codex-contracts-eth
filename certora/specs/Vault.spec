using ERC20A as Token;

methods {
    function unwrapTimestamp(VaultBase.Timestamp) external returns (uint40) envfree;
    function decodeAccountId(VaultBase.AccountId) external returns (address, bytes12) envfree;

    function Token.totalSupply() external returns (uint256) envfree;
}

// Timestamp reasoning.
//
// We use a ghost variable lastTimestamp to keep track of the last timestamp recorded in the contract.
// This is used to ensure that timestamps are always increasing.  We also ensure that the timestamp
// does not exceed the uint40 range, which is sufficient for our use case (up to year 36812).

ghost mathint lastTimestamp {
    init_state axiom lastTimestamp > 0; // we must start with a positive timestamp (0 is used to encode "not set")
}

hook TIMESTAMP uint256 time {
    require(to_mathint(time) < max_uint40, "timestamp must not exceed uint40 range (year 36812)");
    require(to_mathint(time) >= lastTimestamp, "timestamp must be increasing");
    lastTimestamp = time;
}


//
// Expected Funds - needed for proving solvency.
//
// expectedFunds[controller][fundId][accountId] is a ghost variable that represents the expected funds for a given account in a fund.
// It is calculated as:
// availableBalance + designatedBalance + ((incoming - outgoing) * (flowEnd - updated))
//
// Here flowEnd is either frozenAt or lockExpiry, depending on whether the fund is frozen or not.
// The variable updated is the last time the flow was updated for the account in the fund, so all flows before
// are already considered in the availableBalance.
//
// We recompute expectedFunds in the store hooks whenever one of the dependencies changes.
// To avoid negative values, we cap the expectedFunds to 0.  It can only temporarily go negative and will
// either revert (e.g. when setting outflow too high), or be corrected by another updated to a different variable.
// We check that explicitly in the invariant expectedFundsMirror().

definition max(mathint a, mathint b) returns mathint = a >= b ? a : b;

definition flowEnd(VaultBase.Controller controller, VaultBase.FundId fundId) returns uint256 
                                                                = frozenAtMirror[controller][fundId] != 0 
                                                                    ? frozenAtMirror[controller][fundId] 
                                                                    : lockExpiryMirror[controller][fundId];
definition expectedFundsHelper(VaultBase.Controller controller, VaultBase.FundId fundId, VaultBase.AccountId accountId) returns mathint =
    availableBalanceMirror[controller][fundId][accountId]
    + designatedBalanceMirror[controller][fundId][accountId]
    + ((incomingMirror[controller][fundId][accountId] 
    - outgoingMirror[controller][fundId][accountId]) 
    * (flowEnd(controller, fundId) 
        - updatedMirror[controller][fundId][accountId]));
definition expectedFundsDef(VaultBase.Controller controller, VaultBase.FundId fundId, VaultBase.AccountId accountId) returns mathint =
    max(expectedFundsHelper(controller, fundId, accountId), 0);

ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => mathint))) expectedFunds {
    init_state axiom 
        (forall VaultBase.Controller controller. 
         forall VaultBase.FundId fundId. 
         forall VaultBase.AccountId accountId. 
            expectedFunds[controller][fundId][accountId] == 0) && 
        (usum VaultBase.AccountId accountId, 
                VaultBase.Controller controller, 
                VaultBase.FundId fundId. 
                    expectedFunds[controller][fundId][accountId]) == 0;
}

definition sumOfExpectedFunds() returns mathint =
    (usum VaultBase.Controller controller, 
            VaultBase.FundId fundId, 
            VaultBase.AccountId accountId. 
                expectedFunds[controller][fundId][accountId]);


// mirror variables of balances in our dummy token.
//
// also prove that totalSupply equals the sum of all balances in the mirror.  This is needed
// to prevent overflows in transfer().

ghost mapping(address => uint256) tokenBalanceOfMirror {
    init_state axiom (forall address a. tokenBalanceOfMirror[a] == 0)
        && (usum address a. tokenBalanceOfMirror[a]) == 0;
}

hook Sload uint256 balance Token._balances[KEY address addr] {
    require(tokenBalanceOfMirror[addr] == balance, "tokenBalance mirror");
}

hook Sstore Token._balances[KEY address addr] uint256 newValue (uint256 oldValue) {
    tokenBalanceOfMirror[addr] = newValue;
}

invariant totalSupplyIsSumOfBalances()
    Token.totalSupply() == (usum address a. tokenBalanceOfMirror[a]);


//------------------------------------------------------------//
// Mirror variables for storage variables in VaultBase.
//------------------------------------------------------------//

// mirror for lockExpiry.

ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) lockExpiryMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            lockExpiryMirror[controller][fundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue 
    _funds[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId].lockExpiry 
{
    require(lockExpiryMirror[controller][fundId] == unwrapTimestamp(defaultValue), "lockExpiry mirror");
}

hook Sstore _funds[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId].lockExpiry 
    VaultBase.Timestamp defaultValue
{
    lockExpiryMirror[controller][fundId] = unwrapTimestamp(defaultValue);

    mathint oldSum = usum VaultBase.Controller c, 
                            VaultBase.FundId f, 
                            VaultBase.AccountId a. 
                                expectedFunds[c][f][a];

    havoc expectedFunds assuming forall VaultBase.Controller c. 
                                 forall VaultBase.FundId f. 
                                 forall VaultBase.AccountId a. 
                                        expectedFunds@new[c][f][a] 
                                            == expectedFundsDef(c, f, a);

    // The above update of expectedFunds changes the individual funds for each account, because the
    // flowEnd changes, but the sum of expected funds should not change, because the net flow between all funds is zero.
    // This would require advanced reasoning over sums:  
    // The individual expectedFunds change by the amount
    //    deltaTime * (incoming - outgoing)
    // The sum of these changes is 
    //    deltaTime * ((sum AccountId a. incoming[a]) - (sum AccountId a. outgoing[a]))
    // and that is zero, because of the invariant incomingEqualsOutgoing().
    //
    // This reasoning cannot be done by the certora prover and it's underlying SMT solvers.  Instead, we
    // just require that this is true.
    require((usum VaultBase.Controller c, 
                            VaultBase.FundId f, 
                            VaultBase.AccountId a. 
                                expectedFunds[c][f][a]) == oldSum, 
                                "sum of expected funds should not change as net flow between all funds is zero");
}


// mirror for lockMaximum.

ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) lockMaximumMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            lockMaximumMirror[controller][fundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue 
    _funds[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId].lockMaximum 
{
    require(lockMaximumMirror[controller][fundId] == unwrapTimestamp(defaultValue), "lockMaximum mirror");
}

hook Sstore _funds[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId].lockMaximum 
    VaultBase.Timestamp defaultValue
{
    lockMaximumMirror[controller][fundId] = unwrapTimestamp(defaultValue);
}


// mirror for outgoing flow
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => VaultBase.TokensPerSecond))) outgoingMirror {
    init_state axiom 
        (forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            outgoingMirror[controller][fundId][accountId] == 0) && 
        (forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        (sum VaultBase.AccountId accountId. outgoingMirror[controller][fundId][accountId]) == 0);
}

hook Sload VaultBase.TokensPerSecond defaultValue 
    _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].flow.outgoing
{
    require(outgoingMirror[controller][fundId][accountId] == defaultValue, "outgoing mirror");
}

hook Sstore _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].flow.outgoing
    VaultBase.TokensPerSecond defaultValue
{
    outgoingMirror[controller][fundId][accountId] = defaultValue;
    expectedFunds[controller][fundId][accountId] = expectedFundsDef(controller, fundId, accountId);
}

// mirror for updated  (last time the flow was updated for the account).
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint40))) updatedMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            updatedMirror[controller][fundId][accountId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue
    _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].flow.updated
{
    require(updatedMirror[controller][fundId][accountId] == unwrapTimestamp(defaultValue), "updated mirror");
}

hook Sstore _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].flow.updated
    VaultBase.Timestamp defaultValue
{
    updatedMirror[controller][fundId][accountId] = unwrapTimestamp(defaultValue);
    expectedFunds[controller][fundId][accountId] = expectedFundsDef(controller, fundId, accountId);
}   


// mirror for available balance
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint128))) availableBalanceMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            availableBalanceMirror[controller][fundId][accountId] == 0;
}

hook Sload uint128 defaultValue
    _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].balance.available
{
    require(availableBalanceMirror[controller][fundId][accountId] == defaultValue, "available balance mirror"); 
    requireInvariant expectedFundsMirror(controller, fundId, accountId);
}   

hook Sstore _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].balance.available
    uint128 defaultValue
{
    availableBalanceMirror[controller][fundId][accountId] = defaultValue;
    expectedFunds[controller][fundId][accountId] = expectedFundsDef(controller, fundId, accountId);
}   

// mirror for incoming flow
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => VaultBase.TokensPerSecond))) incomingMirror {
    init_state axiom 
        (forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            incomingMirror[controller][fundId][accountId] == 0) && 
        (forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        (sum VaultBase.AccountId accountId. incomingMirror[controller][fundId][accountId]) == 0);
}

hook Sload VaultBase.TokensPerSecond defaultValue 
    _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].flow.incoming
{
    require(incomingMirror[controller][fundId][accountId] == defaultValue, "incoming mirror");
}

hook Sstore _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].flow.incoming 
    VaultBase.TokensPerSecond defaultValue
{
    incomingMirror[controller][fundId][accountId] = defaultValue;
    expectedFunds[controller][fundId][accountId] = expectedFundsDef(controller, fundId, accountId);
}

// mirror for frozenAt

ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) frozenAtMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            frozenAtMirror[controller][fundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].frozenAt
{
    require(frozenAtMirror[Controller][FundId] == unwrapTimestamp(defaultValue), "frozenAt mirror");
}

hook Sstore _funds[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId].frozenAt
    VaultBase.Timestamp defaultValue
{
    frozenAtMirror[controller][fundId] = unwrapTimestamp(defaultValue);

    mathint oldSum = usum VaultBase.Controller c, 
                            VaultBase.FundId f, 
                            VaultBase.AccountId a. 
                                expectedFunds[c][f][a];

    havoc expectedFunds assuming forall VaultBase.Controller c. 
                                 forall VaultBase.FundId f. 
                                 forall VaultBase.AccountId a. 
                                        expectedFunds@new[c][f][a] 
                                            == expectedFundsDef(c, f, a);

    // See the comment in the store hook for lockExpiry for an explanation of why this is true.
    require((usum VaultBase.Controller c, 
                            VaultBase.FundId f, 
                            VaultBase.AccountId a. 
                                expectedFunds[c][f][a]) == oldSum,
                                "sum of expected funds should not change as net flow between all funds is zero");
}

// mirror for designated balance
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint128))) designatedBalanceMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            designatedBalanceMirror[controller][fundId][accountId] == 0;
}

hook Sload uint128 defaultValue
    _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].balance.designated
{
    require(designatedBalanceMirror[controller][fundId][accountId] == defaultValue, "designated balance mirror");
    requireInvariant expectedFundsMirror(controller, fundId, accountId);
}   

hook Sstore _accounts[KEY VaultBase.Controller controller][KEY VaultBase.FundId fundId][KEY VaultBase.AccountId accountId].balance.designated
    uint128 defaultValue
{
    designatedBalanceMirror[controller][fundId][accountId] = defaultValue;
    expectedFunds[controller][fundId][accountId] = expectedFundsDef(controller, fundId, accountId);
} 

// Auxiliary invariants

// Timestamp must always be positive (non-zero).
invariant timestampPositive() lastTimestamp > 0;


//------------------------------------------------------------//
// Invariants of the Vault
//------------------------------------------------------------//

// 1 - verified
// lockExpiry is always less than or equal to lockMaximum.
// (∀ controller ∈ Controller, fundId ∈ FundId:
//   fund.lockExpiry <= fund.lockMaximum
//   where fund = _funds[controller][fundId])
invariant lockExpiryLELockMaximum()
    forall VaultBase.Controller controller.
    forall VaultBase.FundId fundId.
        lockExpiryMirror[controller][fundId] <= lockMaximumMirror[controller][fundId];

//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//

// 2 - verified
// the available balance of an account is large enough to cover the outgoing flow until the maximum lock time.  
// (∀ controller ∈ Controller, fundId ∈ FundId, accountId ∈ AccountId:
//   flow.outgoing * (fund.lockMaximum - flow.updated) <= balance.available
//   where fund = _funds[controller][fundId])
//   and flow = _accounts[controller][fundId][accountId].flow
//   and balance = _accounts[controller][fundId][accountId].balance
invariant outgoingLEAvailable()
    forall VaultBase.Controller controller.
    forall VaultBase.FundId fundId.
    forall VaultBase.AccountId accountId.
        (outgoingMirror[controller][fundId][accountId] 
            * (lockMaximumMirror[controller][fundId] 
                - updatedMirror[controller][fundId][accountId])) 
        <= availableBalanceMirror[controller][fundId][accountId]
{
    preserved {
            requireInvariant noOutflowBeforeLocked();
    }
}

//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//

definition statusCVL(VaultBase.Controller controller, VaultBase.FundId fundId) returns VaultBase.FundStatus = 
    lastTimestamp < lockExpiryMirror[controller][fundId] ? 
        (frozenAtMirror[controller][fundId] != 0 ? VaultBase.FundStatus.Frozen : VaultBase.FundStatus.Locked) :
            (lockMaximumMirror[controller][fundId] == 0 ? VaultBase.FundStatus.Inactive : VaultBase.FundStatus.Withdrawing);

// 3 - verified
// the sum of incoming flows equals the sum of outgoing flows each controller and fundId.
// (∀ controller ∈ Controller, fundId ∈ FundId:
//   (∑ accountId ∈ AccountId: accounts[accountId].flow.incoming) =
//   (∑ accountId ∈ AccountId: accounts[accountId].flow.outgoing)
//   where accounts = _accounts[controller][fundId])
invariant incomingEqualsOutgoing()
    (forall VaultBase.Controller controller.
     forall VaultBase.FundId fundId.
    statusCVL(controller, fundId) != VaultBase.FundStatus.Withdrawing
        => (sum 
                VaultBase.AccountId accountId. 
                    outgoingMirror[controller][fundId][accountId]) 
            == (sum
                VaultBase.AccountId accountId. 
                    incomingMirror[controller][fundId][accountId]));

//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//

// invariant 4 (Certora's solvency) - timeout in flow, all others varified
// This is the solvency invariant:
// sum of expected funds for all accounts in all funds must be less than or equal to the token balance of the contract.
invariant solvency()
    sumOfExpectedFunds() <= to_mathint(tokenBalanceOfMirror[currentContract])
{
    preserved {
        requireInvariant updatedLETimestampAndFlowEnd();
        requireInvariant lockExpiryLELockMaximum();
        requireInvariant outgoingLEAvailable();
        requireInvariant incomingEqualsOutgoing();
        requireInvariant noOutflowBeforeLocked();
    }

    preserved deposit
        (VaultBase.FundId fundId, 
            VaultBase.AccountId accountId, uint128 amount) with (env e) {
        requireInvariant totalSupplyIsSumOfBalances();
        requireInvariant updatedLETimestampAndFlowEnd();
        requireInvariant lockExpiryLELockMaximum();
        requireInvariant outgoingLEAvailable();
        requireInvariant incomingEqualsOutgoing();
        requireInvariant noOutflowBeforeLocked();
        require(e.msg.sender != currentContract, "deposit from vault not allowed");
    }
}

//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//

// 5 (needed to prove 2) - verified
// as long as the funds are not yet locked, there must be not be any flows at all.
// This is needed to ensure that setting the lock does not cause the flow invariant to break.
invariant noOutflowBeforeLocked()
    forall VaultBase.Controller controller.
    forall VaultBase.FundId fundId.
    forall VaultBase.AccountId accountId.
        lockMaximumMirror[controller][fundId] == 0 => outgoingMirror[controller][fundId][accountId] == 0
{
    preserved {
        requireInvariant timestampPositive();
    }
}


// 6 - verified
// the last updated timestamp does never exceed the current timestamp or the end of the flow.
// This is needed to ensure that there is no negative time for the flow calculations in expectedFundsDef.
invariant updatedLETimestampAndFlowEnd()
    forall VaultBase.Controller controller. 
    forall VaultBase.FundId fundId. 
    forall VaultBase.AccountId accountId. 
        updatedMirror[controller][fundId][accountId] <= flowEnd(controller, fundId) 
        && updatedMirror[controller][fundId][accountId] <= lastTimestamp
{
    preserved {
        requireInvariant lockExpiryLELockMaximum();
    }
}

// 7 - verified except for timeout in flow
// The expectedFunds ghost variable is always equal to the expectedFundsHelper calculation.
// This invariant is needed to prove solvency and included in the store hooks for available/designated balances.
// The expectedFunds for a single account is calculated as:
//    availableBalance + designatedBalance + ((incoming - outgoing) * (flowEnd - updated))
invariant expectedFundsMirror(VaultBase.Controller controller, VaultBase.FundId fundId, VaultBase.AccountId accountId)
        expectedFunds[controller][fundId][accountId] == expectedFundsHelper(controller, fundId, accountId)
{
    preserved {
        requireInvariant lockExpiryLELockMaximum();
        requireInvariant outgoingLEAvailable();
        requireInvariant noOutflowBeforeLocked();
        requireInvariant updatedLETimestampAndFlowEnd();
    }
}
