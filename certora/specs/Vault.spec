using ERC20A as Token;

methods {
    function unwrapTimestamp(VaultBase.Timestamp) external returns (uint40) envfree;

    function Token.totalSupply() external returns (uint256) envfree;
}

// rule sanity(env e, method f) {
//     calldataarg args;
//     f(e, args);
//     satisfy true;
// }





ghost mathint sumOfBalances {
    init_state axiom sumOfBalances == 0;
}

hook Sload uint256 balance Token._balances[KEY address addr] {
    require sumOfBalances >= to_mathint(balance);
}

hook Sstore Token._balances[KEY address addr] uint256 newValue (uint256 oldValue) {
    sumOfBalances = sumOfBalances - oldValue + newValue;
}

invariant totalSupplyIsSumOfBalances()
    to_mathint(Token.totalSupply()) == sumOfBalances;







ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) lockExpiryMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            lockExpiryMirror[controller][fundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue 
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockExpiry 
{
    require lockExpiryMirror[Controller][FundId] == unwrapTimestamp(defaultValue);
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockExpiry 
    VaultBase.Timestamp defaultValue
{
    lockExpiryMirror[Controller][FundId] = unwrapTimestamp(defaultValue);
}


ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) lockMaximumMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            lockMaximumMirror[controller][fundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue 
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockMaximum 
{
    require lockMaximumMirror[Controller][FundId] == unwrapTimestamp(defaultValue);
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockMaximum 
    VaultBase.Timestamp defaultValue
{
    lockMaximumMirror[Controller][FundId] = unwrapTimestamp(defaultValue);
}


// frozenAtghost mirror
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) frozenAtMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            frozenAtMirror[controller][fundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].frozenAt
{
    require frozenAtMirror[Controller][FundId] == unwrapTimestamp(defaultValue);
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].frozenAt
    VaultBase.Timestamp defaultValue
{
    frozenAtMirror[Controller][FundId] = unwrapTimestamp(defaultValue);
}


// (∀ controller ∈ Controller, fundId ∈ FundId:
//   fund.lockExpiry <= fund.lockMaximum
//   where fund = _funds[controller][fundId])
// STATUS - verified
invariant lockExpiryLELockMaximum()
    forall VaultBase.Controller controller.
    forall VaultBase.FundId fundId.
        lockExpiryMirror[controller][fundId] <= lockMaximumMirror[controller][fundId];







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
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.outgoing
{
    require outgoingMirror[Controller][FundId][AccountId] == defaultValue;
}

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.outgoing 
    VaultBase.TokensPerSecond defaultValue
{
    outgoingMirror[Controller][FundId][AccountId] = defaultValue;
}




ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint40))) updatedMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            updatedMirror[controller][fundId][accountId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.updated
{
    require updatedMirror[Controller][FundId][AccountId] == unwrapTimestamp(defaultValue);
}       

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.updated
    VaultBase.Timestamp defaultValue
{
    updatedMirror[Controller][FundId][AccountId] = unwrapTimestamp(defaultValue);
}   



// now for balance = _accounts[controller][fundId][accountId].balance.available
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint128))) availableBalanceMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            availableBalanceMirror[controller][fundId][accountId] == 0;
}

hook Sload uint128 defaultValue
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.available
{
    require availableBalanceMirror[Controller][FundId][AccountId] == defaultValue;
}   

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.available
    uint128 defaultValue
{
    availableBalanceMirror[Controller][FundId][AccountId] = defaultValue;
}   


// now for balance = _accounts[controller][fundId][accountId].balance.designated
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint128))) designatedBalanceMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            designatedBalanceMirror[controller][fundId][accountId] == 0;
}

hook Sload uint128 defaultValue
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.designated
{
    require designatedBalanceMirror[Controller][FundId][AccountId] == defaultValue;
}   

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.designated
    uint128 defaultValue
{
    designatedBalanceMirror[Controller][FundId][AccountId] = defaultValue;
} 





// (∀ controller ∈ Controller, fundId ∈ FundId, accountId ∈ AccountId:
//   flow.outgoing * (fund.lockMaximum - flow.updated) <= balance.available
//   where fund = _funds[controller][fundId])
//   and flow = _accounts[controller][fundId][accountId].flow
//   and balance = _accounts[controller][fundId][accountId].balance
// invariant outgoingLEAvailable()
//     forall VaultBase.Controller controller.
//     forall VaultBase.FundId fundId.
//     forall VaultBase.AccountId accountId.
//         (outgoingMirror[controller][fundId][accountId] 
//             * (lockMaximumMirror[controller][fundId] 
//                 - updatedMirror[controller][fundId][accountId])) 
//         <= availableBalanceMirror[controller][fundId][accountId];

invariant outgoingLEAvailableEasy()
    forall VaultBase.Controller controller.
    forall VaultBase.FundId fundId.
    forall VaultBase.AccountId accountId.
        (outgoingMirror[controller][fundId][accountId] 
            * (lockMaximumMirror[controller][fundId] 
                - updatedMirror[controller][fundId][accountId])) 
        <= availableBalanceMirror[controller][fundId][accountId];

invariant outgoingLEAvailableEasySingle(VaultBase.Controller controller, VaultBase.FundId fundId, VaultBase.AccountId accountId)
        (outgoingMirror[controller][fundId][accountId] 
            * (lockMaximumMirror[controller][fundId] 
                - updatedMirror[controller][fundId][accountId])) 
        <= availableBalanceMirror[controller][fundId][accountId];

    

invariant supporter()
    forall VaultBase.Controller controller.
    forall VaultBase.FundId fundId.
    forall VaultBase.AccountId accountId.
        lockMaximumMirror[controller][fundId] == 0 => outgoingMirror[controller][fundId][accountId] == 0;









ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint128)) valueMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            valueMirror[controller][fundId] == 0;
}

hook Sload uint128 defaultValue 
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].value 
{
    require valueMirror[Controller][FundId] == defaultValue;
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].value 
    uint128 defaultValue
{
    valueMirror[Controller][FundId] = defaultValue;
}



invariant fundCorrelation()
    









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
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.incoming
{
    require incomingMirror[Controller][FundId][AccountId] == defaultValue;
}

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.incoming 
    VaultBase.TokensPerSecond defaultValue
{
    incomingMirror[Controller][FundId][AccountId] = defaultValue;
}




// (∀ controller ∈ Controller, fundId ∈ FundId:
//   (∑ accountId ∈ AccountId: accounts[accountId].flow.incoming) =
//   (∑ accountId ∈ AccountId: accounts[accountId].flow.outgoing)
//   where accounts = _accounts[controller][fundId])
invariant incomingEqualsOutgoing(env e)
    (forall VaultBase.Controller controller.
     forall VaultBase.FundId fundId.
    statusCVL(controller, fundId) != VaultBase.FundStatus.Withdrawing
        => (sum 
                VaultBase.AccountId accountId. 
                    outgoingMirror[controller][fundId][accountId]) 
            == (sum
                VaultBase.AccountId accountId. 
                    incomingMirror[controller][fundId][accountId]))
    {
        preserved with (env e2) {
            require e.block.timestamp == e2.block.timestamp;
        }
    }


// copying status implementation from Funds.sol using CVL to use it in quantifier
/*
if (Timestamps.currentTime() < fund.lockExpiry) {
      if (fund.frozenAt != Timestamp.wrap(0)) {
        return FundStatus.Frozen;
      }
      return FundStatus.Locked;
    }
    if (fund.lockMaximum == Timestamp.wrap(0)) {
      return FundStatus.Inactive;
    }
    return FundStatus.Withdrawing;
*/

ghost mathint ghostLastTimestamp;
hook TIMESTAMP uint256 time {
    require to_mathint(time) < max_uint40;              // Timestamp type is uint40 that's why we have this require. uint40 is used in the whole contract
    require to_mathint(time) >= ghostLastTimestamp;
    ghostLastTimestamp = time;
}



definition statusCVL(VaultBase.Controller controller, VaultBase.FundId fundId) returns VaultBase.FundStatus = 
    ghostLastTimestamp < lockExpiryMirror[controller][fundId] ? 
        (frozenAtMirror[controller][fundId] != 0 ? VaultBase.FundStatus.Frozen : VaultBase.FundStatus.Locked) :
            (lockMaximumMirror[controller][fundId] == 0 ? VaultBase.FundStatus.Inactive : VaultBase.FundStatus.Withdrawing);

    // if (ghostLastTimestamp < lockExpiryMirror[controller][fundId]) {
    //     if (frozenAtMirror[controller][fundId] != 0) {
    //         return VaultBase.FundStatus.Frozen;
    //     }
    //     return VaultBase.FundStatus.Locked;
    // } 

    // if (lockMaximumMirror[controller][fundId] == 0) {
    //     return VaultBase.FundStatus.Inactive;
    // }
    // return VaultBase.FundStatus.Withdrawing;








// account.balance.available + account.balance.designated + ((incoming - outgoing) * (fund.flowEnd() - flow.updated)) == fund.value
// invariant solvency()
//     forall VaultBase.Controller controller.
//     forall VaultBase.FundId fundId.
//     forall VaultBase.AccountId accountId.
//         availableBalanceMirror[controller][fundId][accountId]
//             + designatedBalanceMirror[controller][fundId][accountId]
//             + ((incomingMirror[controller][fundId][accountId] 
//                 - outgoingMirror[controller][fundId][accountId]) 
//                 * (lockMaximumMirror[controller][fundId] 
//                     - updatedMirror[controller][fundId][accountId])) 
//         == _funds[controller][fundId].value;    
