// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <=0.8.13;

import "bls-solidity/contracts/BN256G1.sol";
import "elliptic-curve-solidity/contracts/EllipticCurve.sol";

contract Proofs {
  uint256 private immutable period;
  uint256 private immutable timeout;
  uint8 private immutable downtime;

  constructor(
    uint256 __period,
    uint256 __timeout,
    uint8 __downtime
  ) public {
    require(block.number > 256, "Insufficient block height");
    period = __period;
    timeout = __timeout;
    downtime = __downtime;
  }

  mapping(bytes32 => bool) private ids;
  mapping(bytes32 => uint256) private starts;
  mapping(bytes32 => uint256) private ends;
  mapping(bytes32 => uint256) private probabilities;
  mapping(bytes32 => uint256) private markers;
  mapping(bytes32 => uint256) private missed;
  mapping(bytes32 => mapping(uint256 => bool)) private received;
  mapping(bytes32 => mapping(uint256 => bool)) private missing;

  function _period() internal view returns (uint256) {
    return period;
  }

  function _timeout() internal view returns (uint256) {
    return timeout;
  }

  function _end(bytes32 id) internal view returns (uint256) {
    return ends[id];
  }

  function _missed(bytes32 id) internal view returns (uint256) {
    return missed[id];
  }

  function periodOf(uint256 timestamp) private view returns (uint256) {
    return timestamp / period;
  }

  function currentPeriod() private view returns (uint256) {
    return periodOf(block.timestamp);
  }

  function _expectProofs(
    bytes32 id,
    uint256 probability,
    uint256 duration
  ) internal {
    require(!ids[id], "Proof id already in use");
    ids[id] = true;
    starts[id] = block.timestamp;
    ends[id] = block.timestamp + duration;
    probabilities[id] = probability;
    markers[id] = uint256(blockhash(block.number - 1)) % period;
  }

  function _getPointer(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (uint8)
  {
    uint256 blockNumber = block.number % 256;
    uint256 periodNumber = proofPeriod % 256;
    uint256 idOffset = uint256(id) % 256;
    uint256 pointer = (blockNumber + periodNumber + idOffset) % 256;
    return uint8(pointer);
  }

  function _getPointer(bytes32 id) internal view returns (uint8) {
    return _getPointer(id, currentPeriod());
  }

  function _getChallenge(uint8 pointer) internal view returns (bytes32) {
    bytes32 hash = blockhash(block.number - 1 - pointer);
    assert(uint256(hash) != 0);
    return keccak256(abi.encode(hash));
  }

  function _getChallenge(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (bytes32)
  {
    return _getChallenge(_getPointer(id, proofPeriod));
  }

  function _getChallenge(bytes32 id) internal view returns (bytes32) {
    return _getChallenge(id, currentPeriod());
  }

  function _getProofRequirement(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (bool isRequired, uint8 pointer)
  {
    if (proofPeriod <= periodOf(starts[id])) {
      return (false, 0);
    }
    if (proofPeriod >= periodOf(ends[id])) {
      return (false, 0);
    }
    pointer = _getPointer(id, proofPeriod);
    bytes32 challenge = _getChallenge(pointer);
    uint256 probability = (probabilities[id] * (256 - downtime)) / 256;
    isRequired = uint256(challenge) % probability == 0;
  }

  function _isProofRequired(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (bool)
  {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, proofPeriod);
    return isRequired && pointer >= downtime;
  }

  function _isProofRequired(bytes32 id) internal view returns (bool) {
    return _isProofRequired(id, currentPeriod());
  }

// proc verifyProof*(tau: Tau, q: openArray[QElement], mus: openArray[blst_scalar], sigma: blst_p1, spk: PublicKey): bool =
//   ## Verify a BLS proof given a query

//   # verify signature on Tau
//   var signature: Signature
//   if not signature.fromBytes(tau.signature):
//     return false
//   if not verify(spk.signkey, $tau.t, signature):
//     return false

//   var first: blst_p1
//   for qelem in q :
//     var prod: blst_p1
//     prod.blst_p1_mult(hashNameI(tau.t.name, qelem.I), qelem.V, 255)
//     first.blst_p1_add_or_double(first, prod)
//     doAssert(blst_p1_on_curve(first).bool)

//   let us = tau.t.u
//   var second: blst_p1
//   for j in 0 ..< len(us) :
//     var prod: blst_p1
//     prod.blst_p1_mult(us[j], mus[j], 255)
//     second.blst_p1_add_or_double(second, prod)
//     doAssert(blst_p1_on_curve(second).bool)

//   var sum: blst_p1
//   sum.blst_p1_add_or_double(first, second)

//   var g{.noInit.}: blst_p2
//   g.blst_p2_from_affine(BLS12_381_G2)

//   return verifyPairings(sum, spk.key, sigma, g)
  struct BnFr {
    // in mratsim/constantine, given the following:
    //
    // func wordsRequired*(bits: int): int {.compileTime.} =
    //   ## Compute the number of limbs required
    //   # from the **announced** bit length
    //   (bits + WordBitWidth - 1) div WordBitWidth
    //
    // type
    //   SecretWord* = distinct uint64
    //
    //   BigInt*[bits: static int] = object
    //     limbs*: array[bits.wordsRequired, SecretWord]
    //
    //   Fr*[C: static Curve] = object    => Fr[C: BN254_Snarks]
    //     mres*: matchingOrderBigInt(C)  =>   mres*: BigInt[254]
    //
    // For the BN254_Snarks curve,
    //   orderBitwidth = 254
    //   wordsRequired = 4 (output of the wordsRequired func above)
    //
    // We can then conclude:
    //
    // type
    //   Fr*[C: BN254_Snarks] = object
    //     mres*: BigInt[254]
    //       limbs*: array[4, uint64]
    //
    // This matches FR = distinct BNU256 in nim-bncurve:
    // type
    //   BNU256* = array[4, uint64]
    //
    // Note: for BLS curves (in nim-blscurve),
    // type
    //   blst_fp = array[0..5, uint64]
    // uint64[4] ls; // this is what the data type SHOULD be
    uint      ls;  // but using a uint256 has the same number of bytes, but
                   // doesn't require conversion
  }
  struct BnFp {
    // see notes from BnFr, the only difference is that we use the
    // ordered bit width in BnFr, as opposed to the bit width for Fr.
    // Both are 254 bits wide, so the data structure is identical.
    // uint64[4] ls; // this is what the data type SHOULD be
    uint      ls;  // but using a uint256 has the same number of bytes, but
                   // doesn't require conversion
  }

  struct BnFp2 {
    // In mratsim/constantine, given the following:
    //
    // type
    //
    //   QuadraticExt*[F] = object
    //     coords*: array[2, F]
    //
    //   Fp2*[C: static Curve] =
    //     QuadraticExt[Fp[C]]      => QuadraticExt[Fp[BN254_Snarks]]
    //
    // equates to
    //   Fp2*[C: static Curve] =
    //     QuadraticExt[Fp[BN254_Snarks]]
    //       coords: array[2, Fp[BN254_Snarks]]
    BnFp[2] fp;
  }

  struct BnP1 {
    BnFp  x;
    BnFp  y;
    BnFp  z;
  }

  struct BnScalar {
    // Taken from nim-blscurve/bls_abi, cannot find an analogue in
    // mratsim/constantine nor nim-bncurve
    //
    // # blst_scalar
    // # = typedesc[array[0..31, byte]]
    // array[typeof(256)(typeof(256)(256 / typeof(256)(8))), byte]
    bytes[32]  ls;
  }

  struct TauZero {
    // bytes[512]  name; // array[512, byte], byte is alias for uint8
    bytes  name;
    int64         n;
    BnP1[]        u; // seq[blst_p1]
  }

  struct Tau {
    TauZero     t;
    bytes32[96] signature;
  }

  // x', y' affine coordinates, result of EllipticCurve.ecMul
  // e.g. https://github.com/witnet/elliptic-curve-solidity/blob/master/examples/Secp256k1.sol
  struct PublicKey {
    uint256 x;
    uint256 y;
  }

  struct QElement {
    int64     i;
    BnScalar  v;
  }
  function isEmpty(bytes32[96] memory array) internal pure returns (bool) {
    for(uint i; i< array.length; i++){
      if(i > 0) {
        return true;
      }
    }
    return false;
  }
  // function toBytes(uint64 x) internal pure returns (bytes memory c) {
  //   bytes32 b = bytes32(64);
  //   c = new bytes(32);
  //   for (uint i=0; i < 32; i++) {
  //       c[i] = b[i];
  //   }
  // }

//   function toBytes(uint i) internal pure returns (bytes memory){
//     if (i == 0) return "0";
//     uint j = i;
//     uint length;
//     while (j != 0){
//         length++;
//         j /= 10;
//     }
//     bytes memory bstr = new bytes(length);
//     uint k = length - 1;
//     while (i != 0){
//         bstr[k--] = byte(48 + i % 10);
//         i /= 10;
//     }
//     return bstr;
// }
  function toBnP1(uint x, uint y) internal pure returns(BnP1 memory p1) {
    BnFp memory bits = BnFp({ls: uint(255)});
    p1 = BnP1(
          {
            x: BnFp({ls: x}),
            y: BnFp({ls: y}),
            z: bits
          });
  }
  function _verifyProof(
    Tau memory tau,
    QElement[] memory q,
    BnFr[10] memory mus,
    // Possibly 48 bytes long, csaba?
    BnP1 memory sigma,
    PublicKey memory spk) internal returns (bool) {

    // is this really needed?
    require(!isEmpty(tau.signature), "Signature cannot be empty");

    // TODO: add verification
    //   if not verify(spk.signkey, $tau.t, signature):
    //     return false

    //   var first: blst_p1
    //   for qelem in q :
    //     var prod: blst_p1
    //     prod.blst_p1_mult(hashNameI(tau.t.name, qelem.I), qelem.V, 255)
    //     first.blst_p1_add_or_double(first, prod)
    //     doAssert(blst_p1_on_curve(first).bool)
    BnP1 memory first;
    for (uint i = 0; i<q.length; i++) {
      QElement memory qelem = q[i];
      bytes memory namei = abi.encodePacked(tau.t.name, qelem.i);
      (uint x, uint y) = BN256G1.hashToTryAndIncrement(namei);// + string(qelem.i));
      // p1Affine = toAffine(qelem.i)
      // TODO: Where does 255 get used???
      // TODO: Where does qelem.v get used???
      (uint mx, uint my) = BN256G1.multiply([x, y, qelem.v]);
      BnP1 memory prod = toBnP1(mx, my);
      (uint ax, uint ay) = BN256G1.add([first.x.ls, first.y.ls, prod.x.ls, prod.y.ls]);
      first = toBnP1(ax, ay);
      require(BN256G1.isOnCurve([first.x.ls, first.y.ls]), "Point must be on BN254 curve");
    }
  }
  
  function _willProofBeRequired(bytes32 id) internal view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, currentPeriod());
    return isRequired && pointer < downtime;
  }

  function _submitProof(bytes32 id, bytes calldata proof) internal {
    require(proof.length > 0, "Invalid proof"); // TODO: replace by actual check
    require(!received[id][currentPeriod()], "Proof already submitted");
    received[id][currentPeriod()] = true;
    emit ProofSubmitted(id, proof);
  }

  function _markProofAsMissing(bytes32 id, uint256 missedPeriod) internal {
    uint256 periodEnd = (missedPeriod + 1) * period;
    require(periodEnd < block.timestamp, "Period has not ended yet");
    require(block.timestamp < periodEnd + timeout, "Validation timed out");
    require(!received[id][missedPeriod], "Proof was submitted, not missing");
    require(_isProofRequired(id, missedPeriod), "Proof was not required");
    require(!missing[id][missedPeriod], "Proof already marked as missing");
    missing[id][missedPeriod] = true;
    missed[id] += 1;
  }

  event ProofSubmitted(bytes32 id, bytes proof);
}
