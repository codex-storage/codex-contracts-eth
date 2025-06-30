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





ghost mapping(address => uint256) tokenBalanceOfMirror {
    init_state axiom forall address a. tokenBalanceOfMirror[a] == 0;
}

ghost mathint sumOfBalances {
    init_state axiom sumOfBalances == 0;
}

hook Sload uint256 balance Token._balances[KEY address addr] {
    require sumOfBalances >= to_mathint(balance);
    require tokenBalanceOfMirror[addr] == balance;
}

hook Sstore Token._balances[KEY address addr] uint256 newValue (uint256 oldValue) {
    sumOfBalances = sumOfBalances - oldValue + newValue;
    tokenBalanceOfMirror[addr] = newValue;
}

invariant totalSupplyIsSumOfBalances()
    to_mathint(Token.totalSupply()) == sumOfBalances;










// new ghosts needed in 1
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) lockExpiryMirror {
    init_state axiom 
        forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
            lockExpiryMirror[Controller][FundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue 
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockExpiry 
{
    require lockExpiryMirror[Controller][FundId] == unwrapTimestamp(defaultValue);

    require forall VaultBase.AccountId AccountId. expectedFunds[Controller][FundId][AccountId] == availableBalanceMirror[Controller][FundId][AccountId]
                                                                + designatedBalanceMirror[Controller][FundId][AccountId]
                                                                + ((incomingMirror[Controller][FundId][AccountId] 
                                                                    - outgoingMirror[Controller][FundId][AccountId]) 
                                                                    * (flowEnd(Controller, FundId) 
                                                                        - updatedMirror[Controller][FundId][AccountId]));
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockExpiry 
    VaultBase.Timestamp defaultValue
{
    lockExpiryMirror[Controller][FundId] = unwrapTimestamp(defaultValue);

    mathint oldSum = usum VaultBase.Controller controller, 
                            VaultBase.FundId fundId, 
                            VaultBase.AccountId AccountId. 
                                expectedFunds[controller][fundId][AccountId];

    havoc expectedFunds assuming forall VaultBase.Controller controller. 
                                 forall VaultBase.FundId fundId. 
                                 forall VaultBase.AccountId AccountId. 
                                        expectedFunds@new[controller][fundId][AccountId] 
                                            == availableBalanceMirror[controller][fundId][AccountId]
                                                + designatedBalanceMirror[controller][fundId][AccountId]
                                                + ((incomingMirror[controller][fundId][AccountId] 
                                                    - outgoingMirror[controller][fundId][AccountId]) 
                                                    * (flowEnd(Controller, FundId)  
                                                        - updatedMirror[controller][fundId][AccountId]));

    require (usum VaultBase.Controller controller, 
                            VaultBase.FundId fundId, 
                            VaultBase.AccountId AccountId. 
                                expectedFunds[controller][fundId][AccountId]) == oldSum;
}



ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) lockMaximumMirror {
    init_state axiom 
        forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
            lockMaximumMirror[Controller][FundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue 
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockMaximum 
{
    require lockMaximumMirror[Controller][FundId] == unwrapTimestamp(defaultValue);
    // require forall VaultBase.AccountId AccountId. expectedFunds[Controller][FundId][AccountId] == availableBalanceMirror[Controller][FundId][AccountId]
    //                                                             + designatedBalanceMirror[Controller][FundId][AccountId]
    //                                                             + ((incomingMirror[Controller][FundId][AccountId] 
    //                                                                 - outgoingMirror[Controller][FundId][AccountId]) 
    //                                                                 * (flowEnd(Controller, FundId) 
    //                                                                     - updatedMirror[Controller][FundId][AccountId]));
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].lockMaximum 
    VaultBase.Timestamp defaultValue
{
    lockMaximumMirror[Controller][FundId] = unwrapTimestamp(defaultValue);
    // require forall VaultBase.AccountId AccountId. expectedFunds[Controller][FundId][AccountId] == availableBalanceMirror[Controller][FundId][AccountId]
    //                                                 + designatedBalanceMirror[Controller][FundId][AccountId]
    //                                                 + ((incomingMirror[Controller][FundId][AccountId] 
    //                                                     - outgoingMirror[Controller][FundId][AccountId]) 
    //                                                     * (lockMaximumMirror[Controller][FundId] 
    //                                                         - updatedMirror[Controller][FundId][AccountId]));
    
    // mathint oldSum = usum VaultBase.Controller controller, 
    //                         VaultBase.FundId fundId, 
    //                         VaultBase.AccountId AccountId. 
    //                             expectedFunds[controller][fundId][AccountId];

    // havoc expectedFunds assuming forall VaultBase.Controller controller. 
    //                              forall VaultBase.FundId fundId. 
    //                              forall VaultBase.AccountId AccountId. 
    //                                     expectedFunds@new[controller][fundId][AccountId] 
    //                                         == availableBalanceMirror[controller][fundId][AccountId]
    //                                             + designatedBalanceMirror[controller][fundId][AccountId]
    //                                             + ((incomingMirror[controller][fundId][AccountId] 
    //                                                 - outgoingMirror[controller][fundId][AccountId]) 
    //                                                 * (flowEnd(Controller, FundId)  
    //                                                     - updatedMirror[controller][fundId][AccountId]));

    // require (usum VaultBase.Controller controller, 
    //                         VaultBase.FundId fundId, 
    //                         VaultBase.AccountId AccountId. 
    //                             expectedFunds[controller][fundId][AccountId]) == oldSum;
}

// 1 - verified
// (∀ Controller ∈ Controller, FundId ∈ FundId:
//   fund.lockExpiry <= fund.lockMaximum
//   where fund = _funds[Controller][FundId])
invariant lockExpiryLELockMaximum()
    forall VaultBase.Controller Controller.
    forall VaultBase.FundId FundId.
        lockExpiryMirror[Controller][FundId] <= lockMaximumMirror[Controller][FundId];
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//





// new ghosts needed in 2
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => VaultBase.TokensPerSecond))) outgoingMirror {
    init_state axiom 
        (forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
        forall VaultBase.AccountId AccountId. 
            outgoingMirror[Controller][FundId][AccountId] == 0) && 
        (forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
        (sum VaultBase.AccountId AccountId. outgoingMirror[Controller][FundId][AccountId]) == 0);
}

hook Sload VaultBase.TokensPerSecond defaultValue 
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.outgoing
{
    require outgoingMirror[Controller][FundId][AccountId] == defaultValue;
    require expectedFunds[Controller][FundId][AccountId] == availableBalanceMirror[Controller][FundId][AccountId]
                                                            + designatedBalanceMirror[Controller][FundId][AccountId]
                                                            + ((incomingMirror[Controller][FundId][AccountId] 
                                                                - defaultValue) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - updatedMirror[Controller][FundId][AccountId]));
}

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.outgoing 
    VaultBase.TokensPerSecond defaultValue
{
    outgoingMirror[Controller][FundId][AccountId] = defaultValue;
    expectedFunds[Controller][FundId][AccountId] = availableBalanceMirror[Controller][FundId][AccountId]
                                                            + designatedBalanceMirror[Controller][FundId][AccountId]
                                                            + ((incomingMirror[Controller][FundId][AccountId] 
                                                                - defaultValue) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - updatedMirror[Controller][FundId][AccountId]));
}



ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint40))) updatedMirror {
    init_state axiom 
        forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
        forall VaultBase.AccountId AccountId. 
            updatedMirror[Controller][FundId][AccountId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.updated
{
    require updatedMirror[Controller][FundId][AccountId] == unwrapTimestamp(defaultValue);
    require expectedFunds[Controller][FundId][AccountId] == availableBalanceMirror[Controller][FundId][AccountId]
                                                            + designatedBalanceMirror[Controller][FundId][AccountId]
                                                            + ((incomingMirror[Controller][FundId][AccountId] 
                                                                - outgoingMirror[Controller][FundId][AccountId]) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - unwrapTimestamp(defaultValue)));
}       

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.updated
    VaultBase.Timestamp defaultValue
{
    updatedMirror[Controller][FundId][AccountId] = unwrapTimestamp(defaultValue);
    expectedFunds[Controller][FundId][AccountId] = availableBalanceMirror[Controller][FundId][AccountId]
                                                            + designatedBalanceMirror[Controller][FundId][AccountId]
                                                            + ((incomingMirror[Controller][FundId][AccountId] 
                                                                - outgoingMirror[Controller][FundId][AccountId]) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - unwrapTimestamp(defaultValue)));
}   



ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint128))) availableBalanceMirror {
    init_state axiom 
        forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
        forall VaultBase.AccountId AccountId. 
            availableBalanceMirror[Controller][FundId][AccountId] == 0;
}

hook Sload uint128 defaultValue
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.available
{
    require availableBalanceMirror[Controller][FundId][AccountId] == defaultValue;
    require expectedFunds[Controller][FundId][AccountId] == defaultValue
                                                            + designatedBalanceMirror[Controller][FundId][AccountId]
                                                            + ((incomingMirror[Controller][FundId][AccountId] 
                                                                - outgoingMirror[Controller][FundId][AccountId]) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - updatedMirror[Controller][FundId][AccountId]));
}   

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.available
    uint128 defaultValue
{
    availableBalanceMirror[Controller][FundId][AccountId] = defaultValue;
    expectedFunds[Controller][FundId][AccountId] = defaultValue
                                                            + designatedBalanceMirror[Controller][FundId][AccountId]
                                                            + ((incomingMirror[Controller][FundId][AccountId] 
                                                                - outgoingMirror[Controller][FundId][AccountId]) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - updatedMirror[Controller][FundId][AccountId]));
}   



// 2 - verified
// (∀ Controller ∈ Controller, FundId ∈ FundId, AccountId ∈ AccountId:
//   flow.outgoing * (fund.lockMaximum - flow.updated) <= balance.available
//   where fund = _funds[Controller][FundId])
//   and flow = _accounts[Controller][FundId][AccountId].flow
//   and balance = _accounts[Controller][FundId][AccountId].balance
invariant outgoingLEAvailable()
    forall VaultBase.Controller Controller.
    forall VaultBase.FundId FundId.
    forall VaultBase.AccountId AccountId.
        (outgoingMirror[Controller][FundId][AccountId] 
            * (lockMaximumMirror[Controller][FundId] 
                - updatedMirror[Controller][FundId][AccountId])) 
        <= availableBalanceMirror[Controller][FundId][AccountId]
    {
        preserved {
            requireInvariant supporter();
        }
    }
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//





// new ghosts needed in 3
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => VaultBase.TokensPerSecond))) incomingMirror {
    init_state axiom 
        (forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
        forall VaultBase.AccountId AccountId. 
            incomingMirror[Controller][FundId][AccountId] == 0) && 
        (forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
        (sum VaultBase.AccountId AccountId. incomingMirror[Controller][FundId][AccountId]) == 0);
}

hook Sload VaultBase.TokensPerSecond defaultValue 
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.incoming
{
    require incomingMirror[Controller][FundId][AccountId] == defaultValue;
    require expectedFunds[Controller][FundId][AccountId] == availableBalanceMirror[Controller][FundId][AccountId]
                                                            + designatedBalanceMirror[Controller][FundId][AccountId]
                                                            + ((defaultValue 
                                                                - outgoingMirror[Controller][FundId][AccountId]) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - updatedMirror[Controller][FundId][AccountId]));
}

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].flow.incoming 
    VaultBase.TokensPerSecond defaultValue
{
    incomingMirror[Controller][FundId][AccountId] = defaultValue;
    expectedFunds[Controller][FundId][AccountId] = availableBalanceMirror[Controller][FundId][AccountId]
                                                            + designatedBalanceMirror[Controller][FundId][AccountId]
                                                            + ((defaultValue 
                                                                - outgoingMirror[Controller][FundId][AccountId]) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - updatedMirror[Controller][FundId][AccountId]));
}



ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint40)) frozenAtMirror {
    init_state axiom 
        forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
            frozenAtMirror[Controller][FundId] == 0;
}

hook Sload VaultBase.Timestamp defaultValue
    _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].frozenAt
{
    require frozenAtMirror[Controller][FundId] == unwrapTimestamp(defaultValue);

    // old
    // require expectedFunds[Controller][FundId][AccountId] == availableBalanceMirror[Controller][FundId][AccountId]
    //                                                         + designatedBalanceMirror[Controller][FundId][AccountId]
    //                                                         + ((incomingMirror[Controller][FundId][AccountId] 
    //                                                             - outgoingMirror[Controller][FundId][AccountId]) 
    //                                                             * (flowEnd(Controller, FundId)  
    //                                                                 - updatedMirror[Controller][FundId][AccountId]));

    // require frozenAtMirror[Controller][FundId] != 0 => flowEndGhost[Controller][FundId] == frozenAtMirror[Controller][FundId];
    // require frozenAtMirror[Controller][FundId] == 0 => flowEndGhost[Controller][FundId] == lockExpiryMirror[Controller][FundId];


    require forall VaultBase.AccountId AccountId. expectedFunds[Controller][FundId][AccountId] 
                                                            == availableBalanceMirror[Controller][FundId][AccountId]
                                                                + designatedBalanceMirror[Controller][FundId][AccountId]
                                                                + ((incomingMirror[Controller][FundId][AccountId] 
                                                                    - outgoingMirror[Controller][FundId][AccountId]) 
                                                                    * (flowEnd(Controller, FundId) 
                                                                        - updatedMirror[Controller][FundId][AccountId]));
}

hook Sstore _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId].frozenAt
    VaultBase.Timestamp defaultValue
{
    frozenAtMirror[Controller][FundId] = unwrapTimestamp(defaultValue);

    // old
    // expectedFunds[Controller][FundId][AccountId] = availableBalanceMirror[Controller][FundId][AccountId]
    //                                                         + designatedBalanceMirror[Controller][FundId][AccountId]
    //                                                         + ((incomingMirror[Controller][FundId][AccountId] 
    //                                                             - outgoingMirror[Controller][FundId][AccountId]) 
    //                                                             * (flowEnd(Controller, FundId)  
    //                                                                 - updatedMirror[Controller][FundId][AccountId]));

    // flowEndGhost[Controller][FundId] = frozenAtMirror[Controller][FundId] != 0 ? frozenAtMirror[Controller][FundId] : lockExpiryMirror[Controller][FundId];


    mathint oldSum = usum VaultBase.Controller controller, 
                            VaultBase.FundId fundId, 
                            VaultBase.AccountId AccountId. 
                                expectedFunds[controller][fundId][AccountId];

    havoc expectedFunds assuming forall VaultBase.Controller controller. 
                                 forall VaultBase.FundId fundId. 
                                 forall VaultBase.AccountId AccountId. 
                                        expectedFunds@new[controller][fundId][AccountId] 
                                            == availableBalanceMirror[controller][fundId][AccountId]
                                                + designatedBalanceMirror[controller][fundId][AccountId]
                                                + ((incomingMirror[controller][fundId][AccountId] 
                                                    - outgoingMirror[controller][fundId][AccountId]) 
                                                    * (flowEnd(Controller, FundId)  
                                                        - updatedMirror[controller][fundId][AccountId]));

    require (usum VaultBase.Controller controller, 
                            VaultBase.FundId fundId, 
                            VaultBase.AccountId AccountId. 
                                expectedFunds[controller][fundId][AccountId]) == oldSum;
}



ghost mathint ghostLastTimestamp;

hook TIMESTAMP uint256 time {
    require to_mathint(time) < max_uint40;              // Timestamp type is uint40 that's why we have this require. uint40 is used in the whole contract
    require to_mathint(time) >= ghostLastTimestamp;
    require ghostLastTimestamp > 0;     // this require is necessary to avoid violation in "supporter" invariant. It happens only when timestamp == 0 and it's safe to require it because it's not 0 in real life.
    ghostLastTimestamp = time;
}



definition statusCVL(VaultBase.Controller Controller, VaultBase.FundId FundId) returns VaultBase.FundStatus = 
    ghostLastTimestamp < lockExpiryMirror[Controller][FundId] ? 
        (frozenAtMirror[Controller][FundId] != 0 ? VaultBase.FundStatus.Frozen : VaultBase.FundStatus.Locked) :
            (lockMaximumMirror[Controller][FundId] == 0 ? VaultBase.FundStatus.Inactive : VaultBase.FundStatus.Withdrawing);



// 3 - verified
// (∀ Controller ∈ Controller, FundId ∈ FundId:
//   (∑ AccountId ∈ AccountId: accounts[AccountId].flow.incoming) =
//   (∑ AccountId ∈ AccountId: accounts[AccountId].flow.outgoing)
//   where accounts = _accounts[Controller][FundId])
invariant incomingEqualsOutgoing()
    (forall VaultBase.Controller Controller.
     forall VaultBase.FundId FundId.
    statusCVL(Controller, FundId) != VaultBase.FundStatus.Withdrawing
        => (sum 
                VaultBase.AccountId AccountId. 
                    outgoingMirror[Controller][FundId][AccountId]) 
            == (sum
                VaultBase.AccountId AccountId. 
                    incomingMirror[Controller][FundId][AccountId]));
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//





// new ghosts needed in 4
ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => uint128))) designatedBalanceMirror {
    init_state axiom 
        forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
        forall VaultBase.AccountId AccountId. 
            designatedBalanceMirror[Controller][FundId][AccountId] == 0;
}

hook Sload uint128 defaultValue
    _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.designated
{
    require designatedBalanceMirror[Controller][FundId][AccountId] == defaultValue;
    require expectedFunds[Controller][FundId][AccountId] == availableBalanceMirror[Controller][FundId][AccountId]
                                                            + defaultValue
                                                            + ((incomingMirror[Controller][FundId][AccountId] 
                                                                - outgoingMirror[Controller][FundId][AccountId]) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - updatedMirror[Controller][FundId][AccountId]));
}   

hook Sstore _accounts[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId][KEY VaultBase.AccountId AccountId].balance.designated
    uint128 defaultValue
{
    designatedBalanceMirror[Controller][FundId][AccountId] = defaultValue;
    expectedFunds[Controller][FundId][AccountId] = availableBalanceMirror[Controller][FundId][AccountId]
                                                            + defaultValue
                                                            + ((incomingMirror[Controller][FundId][AccountId] 
                                                                - outgoingMirror[Controller][FundId][AccountId]) 
                                                                * (flowEnd(Controller, FundId)  
                                                                    - updatedMirror[Controller][FundId][AccountId]));
} 



ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => mapping(VaultBase.AccountId => mathint))) expectedFunds {
    init_state axiom 
        (forall VaultBase.Controller Controller. 
         forall VaultBase.FundId FundId. 
         forall VaultBase.AccountId AccountId. 
            expectedFunds[Controller][FundId][AccountId] == 0) && 
        (usum VaultBase.AccountId AccountId, 
                VaultBase.Controller Controller, 
                VaultBase.FundId FundId. 
                    expectedFunds[Controller][FundId][AccountId]) == 0;
}



definition flowEnd(VaultBase.Controller Controller, VaultBase.FundId FundId) returns uint256 
                                                                = frozenAtMirror[Controller][FundId] != 0 
                                                                    ? frozenAtMirror[Controller][FundId] 
                                                                    : lockExpiryMirror[Controller][FundId];

// ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => uint256)) flowEndGhost {
//     init_state axiom
//         (forall VaultBase.Controller Controller.
//          forall VaultBase.FundId FundId.
//             flowEndGhost[Controller][FundId] == 0);
// }



// invariant 4 (Certora's solvency) - 
// account.balance.available + account.balance.designated + ((incoming - outgoing) * (fund.flowEnd() - flow.updated)) == _token.balanceOf(currentContract)
invariant solvency()
    (usum VaultBase.Controller Controller, 
            VaultBase.FundId FundId, 
            VaultBase.AccountId AccountId. 
                expectedFunds[Controller][FundId][AccountId]) == to_mathint(tokenBalanceOfMirror[currentContract])
    // forall VaultBase.Controller Controller.
    // forall VaultBase.FundId FundId.
    // forall VaultBase.AccountId AccountId.
        // availableBalanceMirror[Controller][FundId][AccountId]
        //     + designatedBalanceMirror[Controller][FundId][AccountId]
        //     + ((incomingMirror[Controller][FundId][AccountId] 
        //         - outgoingMirror[Controller][FundId][AccountId]) 
        //         * (lockMaximumMirror[Controller][FundId] 
        //             - updatedMirror[Controller][FundId][AccountId])) 
    //     == tokenBalanceOfMirror[currentContract]
        {
            preserved {
                requireInvariant lockExpiryLELockMaximum();
                requireInvariant outgoingLEAvailable();
                requireInvariant incomingEqualsOutgoing();
                requireInvariant supporter();
            }
        }
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//
//------------------------------------------------------------//





// 5 (needed to prove 2) - verified
invariant supporter()
    forall VaultBase.Controller Controller.
    forall VaultBase.FundId FundId.
    forall VaultBase.AccountId AccountId.
        lockMaximumMirror[Controller][FundId] == 0 => outgoingMirror[Controller][FundId][AccountId] == 0;




// 6 
invariant updatedMirrorCheck()
    forall VaultBase.Controller Controller. 
        forall VaultBase.FundId FundId. 
        forall VaultBase.AccountId AccountId. 
            updatedMirror[Controller][FundId][AccountId] <= flowEnd(Controller, FundId) 
            && updatedMirror[Controller][FundId][AccountId] <= ghostLastTimestamp;

