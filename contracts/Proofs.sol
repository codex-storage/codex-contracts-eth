// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <=0.8.13;

import "bls-solidity/contracts/BN256G1.sol";
import "./ecc/AltBn254.sol";
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
  // blst_fp6* {.byref.} = object
  //   fp2*: array[3, blst_fp2]
  struct BnFp6 {
    BnFp2[3]  fp2;
  }
  // blst_fp12* {.byref.} = object
  //   fp6*: array[2, blst_fp6]
  struct BnFp12 {
    BnFp6[2]  fp6;
  }

  struct BnP1 {
    BnFp  x;
    BnFp  y;
    // BnFp  z; // for some reason, BN254G1 doesn't accept z in operations on
                // jacobian coords, and removing an unused field is easier
                // trying to instantiate a struct with an unused field.
  }

  struct BnP1Affine {
    BnFp  x;
    BnFp  y;
  }

  // blst_p2* {.byref.} = object
  //   x*: blst_fp2
  //   y*: blst_fp2
  //   z*: blst_fp2
  struct BnP2 {
    BnFp2 x;
    BnFp2 y;
    // BnFp2 z; // for some reason, BN254G1 doesn't accept z in operations on
                // jacobian coords, and removing an unused field is easier
                // trying to instantiate a struct with an unused field.
  }

  // blst_p2_affine* {.byref.} = object
  //   x*: blst_fp2
  //   y*: blst_fp2
  struct BnP2Affine {
    BnFp2 x;
    BnFp2 y;
  }

  struct BnScalar {
    // Taken from nim-blscurve/bls_abi, cannot find an analogue in
    // mratsim/constantine nor nim-bncurve
    //
    // # blst_scalar
    // # = typedesc[array[0..31, byte]]
    // array[typeof(256)(typeof(256)(256 / typeof(256)(8))), byte]
    bytes32  ls;
  }

  struct TauZero {
    // bytes[512]  name; // array[512, byte], byte is alias for uint8
    bytes           name;
    int64           n;
    Curve.G1Point[] u; // seq[blst_p1]
  }

  struct Tau {
    TauZero       t;
    // bytes32[96] signature;
    Curve.G1Point signature;
  }

  // x', y' affine coordinates, result of EllipticCurve.ecMul
  // e.g. https://github.com/witnet/elliptic-curve-solidity/blob/master/examples/Secp256k1.sol
  struct PublicKey {
    Curve.G1Point signkey;
    Curve.G2Point key;
    // uint256 x;
    // uint256 y;
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
  // function toBnP1(uint x, uint y) internal pure returns(BnP1 memory p1) {
  //   p1 = BnP1(
  //         {
  //           x: BnFp({ls: x}),
  //           y: BnFp({ls: y})
  //         });
  // }

  // function toBnP2(uint x, uint y) internal pure returns(BnP2 memory p2) {
  //   p2 = BnP2(
  //         {
  //           x: BnFp2({ls: x}),
  //           y: BnFp2({ls: y})
  //         });
  // }

  // proc pairing(a: blst_p1, b: blst_p2): blst_fp12 =
  //   ## Calculate pairing G_1,G_2 -> G_T
  //   var aa: blst_p1_affine
  //   var bb: blst_p2_affine
  //   blst_p1_to_affine(aa, a)
  //   blst_p2_to_affine(bb, b)
  //   var l: blst_fp12
  //   blst_miller_loop(l, bb, aa)
  //   blst_final_exp(result, l)
  // function _pairing (BnP1 memory a, BnP2 memory b) internal returns (BnFp12 memory fp12) {
  //   (uint aax, uint aay) = EllipticCurve.toAffine(a.x, a.y, _z, BN256G1.PP);
  //   (uint bbx, uint bby) = EllipticCurve.toAffine(b.x, b.y, _z, BN256G1.PP);
  // }

  // function _verifyPairings (
  //   BnP1 memory a1,
  //   BnP2 memory a2,
  //   BnP1 memory b1,
  //   BnP2 memory b2) internal returns (bool) {

  //   // let e1 = pairing(a1, a2)
  //   // let e2 = pairing(b1, b2)
  //   // return e1 == e2
  //   BnFp12 memory e1 = _pairing(a1, a2);
  //   BnFp12 memory e2 = _pairing(b1, b2);
  //   return e1 == e2;

  // }

  // Example of BLS signature verification
  // Taken from: https://ethereum.stackexchange.com/a/59315
  function _verifySignature(
    Curve.G1Point memory sig,
    Curve.G2Point memory signkey,
    uint hashedMsg) internal view returns (bool)
  {

    // bytes memory message = hex"7b0a2020226f70656e223a207b0a20202020227072696365223a2039353931372c0a202020202274696d65223a207b0a20202020202022756e6978223a20313438333134323430302c0a2020202020202269736f223a2022323031362d31322d33315430303a30303a30302e3030305a220a202020207d0a20207d2c0a202022636c6f7365223a207b0a20202020227072696365223a2039363736302c0a202020202274696d65223a207b0a20202020202022756e6978223a20313438333232383830302c0a2020202020202269736f223a2022323031372d30312d30315430303a30303a30302e3030305a220a202020207d0a20207d2c0a2020226c6f6f6b7570223a207b0a20202020227072696365223a2039363736302c0a20202020226b223a20312c0a202020202274696d65223a207b0a20202020202022756e6978223a20313438333232383830302c0a2020202020202269736f223a2022323031372d30312d30315430303a30303a30302e3030305a220a202020207d0a20207d0a7d0a6578616d706c652e636f6d2f6170692f31";

    // Curve.G1Point memory signature = Curve.G1Point(11181692345848957662074290878138344227085597134981019040735323471731897153462, 6479746447046570360435714249272776082787932146211764251347798668447381926167);

    // Curve.G2Point memory v = Curve.G2Point(
    //   [18523194229674161632574346342370534213928970227736813349975332190798837787897, 5725452645840548248571879966249653216818629536104756116202892528545334967238],
    //   [3816656720215352836236372430537606984911914992659540439626020770732736710924, 677280212051826798882467475639465784259337739185938192379192340908771705870]
    // );

    Curve.G1Point memory h = Curve.HashToPoint(hashedMsg);

    return Curve.pairingProd2(Curve.g1neg(sig), Curve.P2(), h, signkey);
  }

  function _isOnCurve(Curve.G1Point memory g1) internal view returns (bool) {
    return EllipticCurve.isOnCurve(
      g1.X,
      g1.Y,
      Curve.A(),
      Curve.B(),
      Curve.P());
  }
  function _verifyProof(
    Tau memory tau,
    QElement[] memory q,
    BnFr[10] memory mus,
    // Possibly 48 bytes long, csaba?
    // If only 48 bytes, how can it be a G1Point? (x, y both only 24 bytes?)
    Curve.G1Point memory sigma,
    PublicKey memory spk) internal returns (bool) {

    // TODO: is this needed in solidity?
    // require(!isEmpty(tau.signature), "Signature cannot be empty");

    // TODO: $tau.t -- how to do this in solidity?
    // TODO: what's the second G2 point needed, PublicKey.signkey is a G1
    // point?? Is using the PublicKey.key sufficient?
    uint hashedMsg = uint(sha256(abi.encodePacked(tau.t)));
    require(_verifySignature(tau.signature, spk.key, hashedMsg),
      "invalid signature");

    // var first: blst_p1
    // for qelem in q :
    //   var prod: blst_p1
    //   prod.blst_p1_mult(hashNameI(tau.t.name, qelem.I), qelem.V, 255)
    //   first.blst_p1_add_or_double(first, prod)
    //   doAssert(blst_p1_on_curve(first).bool)
    Curve.G1Point memory first;
    for (uint i = 0; i<q.length; i++) {
      QElement memory qelem = q[i];
      bytes32 namei = sha256(abi.encodePacked(tau.t.name, qelem.i));
      // Step 4: arbitraty string to point and check if it is on curve
      uint hPointX = uint256(namei);
      Curve.G1Point memory h = Curve.HashToPoint(hPointX);
      // TODO: Where does 255 get used???
      // TODO: Can we convert qelem.v.ls from a 32 byte array to a uint256 without worry?
      // TODO: It's very hard to know if multiply takes jacobian or affine coords...???
      Curve.G1Point memory prod = Curve.g1mul(h, uint(qelem.v.ls));
      first = Curve.g1add(first, prod);
      require(_isOnCurve(first), "must be on BN254 curve");
    }
    // let us = tau.t.u
    // var second: blst_p1
    // for j in 0 ..< len(us) :
    //   var prod: blst_p1
    //   prod.blst_p1_mult(us[j], mus[j], 255)
    //   second.blst_p1_add_or_double(second, prod)
    //   doAssert(blst_p1_on_curve(second).bool)
    Curve.G1Point[] memory us = tau.t.u;
    Curve.G1Point memory second;
    for (uint j = 0; j<us.length; j++) {
      // TODO: Where does 255 get used???
      Curve.G1Point memory prod = Curve.g1mul(us[j], mus[j].ls);
      second = Curve.g1add(second, prod);
      require(_isOnCurve(second), "must be on BN254 curve");
    }

    // var sum: blst_p1
    // sum.blst_p1_add_or_double(first, second)
    Curve.G1Point memory sum = Curve.g1add(first, second);

    // var g{.noInit.}: blst_p2
    // g.blst_p2_from_affine(BLS12_381_G2)
    // TODO: do we need to convert Curve.P2() to/from affine???

    // return verifyPairings(sum, spk.key, sigma, g)
    return Curve.pairingProd2(sum, spk.key, sigma, Curve.P2());

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
