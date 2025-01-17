// Import types and APIs from graph-ts
import { BigDecimal, BigInt, ByteArray, Bytes, crypto, ens } from "@graphprotocol/graph-ts";

import {
  checkValidLabel,
  concat,
  createEventID,
  ETH_NODE,
  uint256ToByteArray,
} from "./utils";

// Import event types from the registry contract ABI
import {
  NameRegistered as NameRegisteredEvent,
  NameRenewed as NameRenewedEvent,
  Transfer as TransferEvent,
} from "./types/BaseRegistrar/BaseRegistrar";

import {
  NameRegistered as ControllerNameRegisteredEvent,
  NameRenewed as ControllerNameRenewedEvent,
  BlacklistChanged as BlacklistChangedEvent,
  ReferralFeeReceived as ReferralFeeReceivedEvent
} from "./types/EthRegistrarController/EthRegistrarController";

// Import entity types generated from the GraphQL schema
import {
  Account,
  Blacklist,
  BlacklistChanged,
  Domain,
  NameRegistered,
  NameRenewed,
  NameTransferred,
  ReferralFeeReceived,
  Referrer,
  Registration,
} from "./types/schema";

const GRACE_PERIOD_SECONDS = BigInt.fromI32(2592000); // 30 days

var rootNode: ByteArray = ByteArray.fromHexString(ETH_NODE);

export function handleNameRegistered(event: NameRegisteredEvent): void {
  let account = new Account(event.params.owner.toHex());
  account.save();

  let label = uint256ToByteArray(event.params.id);
  let registration = new Registration(label.toHex());
  let domain = Domain.load(crypto.keccak256(concat(rootNode, label)).toHex())!;

  registration.domain = domain.id;
  registration.registrationDate = event.block.timestamp;
  registration.expiryDate = event.params.expires;
  registration.registrant = account.id;

  domain.registrant = account.id;
  domain.expiryDate = event.params.expires.plus(GRACE_PERIOD_SECONDS);

  let labelName = ens.nameByHash(label.toHexString());
  if (checkValidLabel(labelName)) {
    domain.labelName = labelName;
    domain.name = labelName! + ".pls";
    registration.labelName = labelName;
  }
  domain.save();
  registration.save();

  let registrationEvent = new NameRegistered(createEventID(event));
  registrationEvent.registration = registration.id;
  registrationEvent.blockNumber = event.block.number.toI32();
  registrationEvent.transactionID = event.transaction.hash;
  registrationEvent.registrant = account.id;
  registrationEvent.expiryDate = event.params.expires;
  registrationEvent.save();
}

export function handleNameRegisteredByController(
  event: ControllerNameRegisteredEvent
): void {
  setNamePreimage(
    event.params.name,
    event.params.label,
    event.params.baseCost.plus(event.params.premium)
  );
}

export function handleNameRenewedByController(
  event: ControllerNameRenewedEvent
): void {
  setNamePreimage(event.params.name, event.params.label, event.params.cost);
}

function setNamePreimage(name: string, label: Bytes, cost: BigInt): void {
  if (!checkValidLabel(name)) {
    return;
  }

  let domain = Domain.load(crypto.keccak256(concat(rootNode, label)).toHex())!;
  if (domain.labelName != name) {
    domain.labelName = name;
    domain.name = name + ".pls";
    domain.save();
  }

  let registration = Registration.load(label.toHex());
  if (registration == null) return;
  registration.labelName = name;
  registration.cost = cost;
  registration.save();
}

export function handleNameRenewed(event: NameRenewedEvent): void {
  let label = uint256ToByteArray(event.params.id);
  let registration = Registration.load(label.toHex())!;
  let domain = Domain.load(crypto.keccak256(concat(rootNode, label)).toHex())!;

  registration.expiryDate = event.params.expires;
  domain.expiryDate = event.params.expires.plus(GRACE_PERIOD_SECONDS);

  registration.save();
  domain.save();

  let registrationEvent = new NameRenewed(createEventID(event));
  registrationEvent.registration = registration.id;
  registrationEvent.blockNumber = event.block.number.toI32();
  registrationEvent.transactionID = event.transaction.hash;
  registrationEvent.expiryDate = event.params.expires;
  registrationEvent.save();
}

export function handleNameTransferred(event: TransferEvent): void {
  let account = new Account(event.params.to.toHex());
  account.save();

  let label = uint256ToByteArray(event.params.tokenId);
  let registration = Registration.load(label.toHex());
  if (registration == null) return;

  let domain = Domain.load(crypto.keccak256(concat(rootNode, label)).toHex())!;

  registration.registrant = account.id;
  domain.registrant = account.id;

  domain.save();
  registration.save();

  let transferEvent = new NameTransferred(createEventID(event));
  transferEvent.registration = label.toHex();
  transferEvent.blockNumber = event.block.number.toI32();
  transferEvent.transactionID = event.transaction.hash;
  transferEvent.newOwner = account.id;
  transferEvent.save();
}

export function handleBlacklistChanged(event: BlacklistChangedEvent): void {
  let blacklist = Blacklist.load(event.params.account.toHex());
  if (blacklist == null) {
    blacklist = new Blacklist(event.params.account.toHex());
  }
  blacklist.banned = event.params.banned;
  blacklist.save();

  let blacklistChangedEvent = new BlacklistChanged(createEventID(event));
  blacklistChangedEvent.account = event.params.account.toHex();
  blacklistChangedEvent.banned = event.params.banned;
  blacklistChangedEvent.blockNumber = event.block.number.toI32();
  blacklistChangedEvent.transactionID = event.transaction.hash;
  blacklistChangedEvent.save();
}

export function handleReferralFeeReceived(event: ReferralFeeReceivedEvent): void {
  let referrer = Referrer.load(event.params.referrer.toHex());
  if (referrer == null) {
    referrer = new Referrer(event.params.referrer.toHex());
    referrer.count = 0;
    referrer.commission = BigDecimal.zero();
  }
  referrer.count += 1;
  if (!event.params.amount.isZero()) {
    referrer.commission = referrer.commission.plus(event.params.amount.toBigDecimal());
  }
  referrer.save();

  let referralFeeReceivedEvent = new ReferralFeeReceived(createEventID(event));
  referralFeeReceivedEvent.referrer = event.params.referrer.toHex();
  referralFeeReceivedEvent.amount = event.params.amount;
  referralFeeReceivedEvent.save();
}