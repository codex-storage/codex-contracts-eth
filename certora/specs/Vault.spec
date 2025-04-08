methods {
    
}

rule sanity(env e, method f) {
    calldataarg args;
    f(e, args);
    satisfy true;
}


ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => VaultBase.Timestamp)) lockExpiryMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            lockExpiryMirror[controller][fundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue 
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockExpiry 
{
    require lockExpiryMirror[Controller][FundId] == defaultValue;
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockExpiry 
    VaultBase.Timestamp defaultValue
{
    lockExpiryMirror[Controller][FundId] = defaultValue;
}


ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => VaultBase.Timestamp)) lockMaximumMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
            lockMaximumMirror[controller][fundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue 
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockMaximum 
{
    require lockMaximumMirror[Controller][FundId] == defaultValue;
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockMaximum 
    VaultBase.Timestamp defaultValue
{
    lockMaximumMirror[Controller][FundId] = defaultValue;
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
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            outgoingMirror[controller][fundId][accountId] == 0;
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




ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => VaultBase.Timestamp))) updatedMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            updatedMirror[controller][fundId][accountId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.updated
{
    require updatedMirror[Controller][FundId][AccountId] == defaultValue;
}       

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.updated
    VaultBase.Timestamp defaultValue
{
    updatedMirror[Controller][FundId][AccountId] = defaultValue;
}   



// now for balance = _accounts[controller][fundId][accountId].balance
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint128))) balanceMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            balanceMirror[controller][fundId][accountId] == 0;
}

hook Sload uint128 defaultValue
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.available
{
    require balanceMirror[Controller][FundId][AccountId] == defaultValue;
}   

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.available
    uint128 defaultValue
{
    balanceMirror[Controller][FundId][AccountId] = defaultValue;
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
//         <= balanceMirror[controller][fundId][accountId];

invariant outgoingLEAvailableEasy(VaultBase.Controller controller, VaultBase.FundId fundId, VaultBase.AccountId accountId)
    // forall VaultBase.Controller controller.
    // forall VaultBase.FundId fundId.
    // forall VaultBase.AccountId accountId.
        (outgoingMirror[controller][fundId][accountId] 
            * (lockMaximumMirror[controller][fundId] 
                - updatedMirror[controller][fundId][accountId])) 
        <= balanceMirror[controller][fundId][accountId];



    

ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => VaultBase.TokensPerSecond))) incomingMirror {
    init_state axiom 
        forall VaultBase.Controller controller. 
        forall VaultBase.FundId fundId. 
        forall VaultBase.AccountId accountId. 
            incomingMirror[controller][fundId][accountId] == 0;
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
invariant incomingEqualsOutgoing()
    (sum 
        VaultBase.Controller controller. 
        VaultBase.FundId fundId. 
        VaultBase.AccountId accountId. 
            outgoingMirror[controller][fundId][accountId]) 
    == (sum
        VaultBase.Controller controller. 
        VaultBase.FundId fundId. 
        VaultBase.AccountId accountId. 
            incomingMirror[controller][fundId][accountId]);