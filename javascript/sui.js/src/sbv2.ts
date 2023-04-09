import {
  getObjectFields,
  JsonRpcProvider,
  Keypair,
  MoveCallTransaction,
  RawSigner,
  TransactionArgument,
  MoveCallSuiTransaction,
  SuiTransactionBlockResponse,
  bcs,
  SignerWithProvider,
  SuiObjectResponse,
  SubscriptionId,
  TransactionBlock,
  SUI_CLOCK_OBJECT_ID,
} from '@mysten/sui.js';
import { OracleJob } from '@switchboard-xyz/common';
import Big from 'big.js';
import BN from 'bn.js';
import { sha3_256 } from 'js-sha3';

export const SWITCHBOARD_DEVNET_ADDRESS = ``;
export const SWITCHBOARD_TESTNET_ADDRESS = ``;
export const SWITCHBOARD_MAINNET_ADDRESS = ``;

export class SuiDecimal {
  constructor(
    readonly mantissa: string,
    readonly scale: number,
    readonly neg: boolean
  ) {}

  toBig(): Big {
    const oldDp = Big.DP;
    Big.DP = 18;
    let result = new Big(this.mantissa);
    if (this.neg === true) {
      result = result.mul(-1);
    }
    const TEN = new Big(10);
    result = safeDiv(result, TEN.pow(this.scale));
    Big.DP = oldDp;
    return result;
  }

  static fromBig(val: Big): SuiDecimal {
    const value = val.c.slice();
    const e = val.e + 1;
    while (value.length - e > 9) {
      value.pop();
    }

    // Aptos decimals cannot have a negative scale
    while (value.length - e < 0) {
      value.push(0);
    }

    return new SuiDecimal(value.join(''), value.length - e, val.s === -1);
  }

  static fromObj(obj: Object): SuiDecimal {
    const properties = ['mantissa', 'scale', 'neg'];
    properties.forEach((p) => {
      if (!(p in obj)) {
        throw new Error(`Object is missing property ${p}`);
      }
    });

    return new SuiDecimal(obj['mantissa'], obj['scale'], obj['neg']);
  }
}

export enum SwitchboardPermission {
  PERMIT_ORACLE_HEARTBEAT,
  PERMIT_ORACLE_QUEUE_USAGE,
}

export interface AggregatorAddJobParams {
  job: string;
  weight?: number;
}

export interface AggregatorInitParams {
  authority: string; // owner of aggregator
  name: string;
  queueAddress: string;
  coinType?: string;
  batchSize: number;
  minOracleResults: number;
  minJobResults: number;
  minUpdateDelaySeconds: number;
  varianceThreshold?: Big;
  forceReportPeriod?: number;
  disableCrank?: boolean;
  historySize?: number;
  readCharge?: number;
  rewardEscrow?: string;
  readWhitelist?: string[];
  limitReadsToWhitelist?: boolean;
}

export interface AggregatorSaveResultParams {
  oracleAddress: string;
  oracleIdx: number;
  queueAddress: string;
  value: Big;
}

export interface OracleSaveResultParams extends AggregatorSaveResultParams {
  aggregatorAddress: string;
}

export interface JobInitParams {
  name: string;
  data: string | any[];
  weight?: number;
}

export interface AggregatorRemoveJobParams {
  aggregatorAddress: string;
  job: string;
}

export interface AggregatorSetConfigParams {
  authority?: string;
  name?: string;
  queueAddress?: string;
  batchSize?: number;
  minOracleResults?: number;
  minJobResults?: number;
  minUpdateDelaySeconds?: number;
  varianceThreshold?: Big;
  forceReportPeriod?: number;
  disableCrank?: boolean;
  historySize?: number;
  readCharge?: number;
  rewardEscrow?: string;
  readWhitelist?: string[];
  limitReadsToWhitelist?: boolean;
  coinType?: string;
}

export interface OracleInitParams {
  name: string;
  authority: string;
  queue: string;
  coinType?: string;
}

export interface OracleQueueInitParams {
  authority: string;
  name: string;
  oracleTimeout: number;
  reward: number;
  unpermissionedFeedsEnabled: boolean;
  lockLeaseFunding: boolean;
  maxSize: number;
  coinType: string;
}

export interface OracleQueueSetConfigsParams {
  name: string;
  authority: string;
  oracleTimeout: number;
  reward: number;
  unpermissionedFeedsEnabled: boolean;
  lockLeaseFunding: boolean;
  coinType?: string;
}

export interface LeaseExtendParams {
  queueAddress: string;
  loadCoinId: string;
  loadAmount: number;
  coinType: string;
}

export interface LeaseWithdrawParams {
  queueAddress: string;
  amount: number;
  coinType: string;
}

export interface EscrowWithdrawParams {
  oracleAddress: string;
  queueAddress: string;
  amount: number;
}

export interface PermissionInitParams {
  queueId: string;
  objectId: string; // oracle or aggregator object id
  authority: string;
  granter: string;
  grantee: string;
}

export interface PermissionSetParams {
  queueId: string;
  objectId: string; // oracle or aggregator object id
  authority: string;
  granter: string;
  grantee: string;
  permission: SwitchboardPermission;
  enable: boolean;
}

export type EventCallback = (
  e: any
) => Promise<void> /** | (() => Promise<void>) */;

// Cleanup for loadData
const replaceObj = (obj: any) => {
  for (const i in obj) {
    if (typeof obj[i] === 'object') {
      replaceObj(obj[i]);
      if (obj[i] && 'fields' in obj[i]) {
        obj[i] = obj[i].fields;
      }
    }
  }
};

/**
 * Sends and waits for an aptos tx to be confirmed
 * @param signer
 * @param txn
 * @param debug
 * @returns
 */
export async function sendSuiTx(
  signer: SignerWithProvider,
  txn: TransactionBlock,
  debug?: boolean
): Promise<SuiTransactionBlockResponse> {
  const txnRequest = await signer.dryRunTransactionBlock({
    transactionBlock: txn,
  });
  if (txnRequest.effects.status.error) {
    throw new Error(txnRequest.effects.status.error);
  }
  if (debug) {
    console.info(txnRequest);
  }
  return signer.signAndExecuteTransactionBlock({
    transactionBlock: txn,
    options: {
      showInput: true,
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });
}

/**
 * Generates an sui tx for client
 * @param method sui module method
 * @param args Arguments for method (converts numbers to strings)
 * @param typeArgs Arguments for type_args
 * @returns
 */
export function getSuiMoveCall(
  method: `${string}::${string}::${string}`,
  args: Array<any> = [],
  typeArgs: Array<string> = [],
  gasBudget: number = 20000
): TransactionBlock {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: method,
    typeArguments: typeArgs,
    arguments: args,
  });
  return tx;
}

/**
 * Events on Sui
 */
export class SuiEvent {
  intervalId?: SubscriptionId;
  constructor(
    readonly provider: JsonRpcProvider,
    readonly pkg?: string,
    readonly moduleName?: string,
    readonly moveEvent?: string,
    readonly eventType?: string
  ) {}

  async onTrigger(
    callback: EventCallback,
    errorHandler?: (error: unknown) => void
  ) {
    try {
      const filters = [];
      if (this.pkg) {
        filters.push({ Package: this.pkg });
      }
      if (this.moduleName) {
        filters.push({ Module: this.moduleName });
      }
      if (this.eventType) {
        filters.push({ EventType: this.eventType });
      }
      if (this.moveEvent) {
        filters.push({ MoveEventType: this.moveEvent });
      }

      this.intervalId = await this.provider.subscribeEvent({
        filter: {
          All: filters,
        },
        onMessage: (event) => {
          try {
            callback(event);
          } catch (e) {
            errorHandler(e);
          }
        },
      });
      return this.intervalId;
    } catch (e) {}
  }

  stop() {
    this.provider.unsubscribeEvent({
      id: this.intervalId,
    });
  }
}

export class AggregatorAccount {
  constructor(
    readonly provider: JsonRpcProvider,
    readonly address: string,
    readonly switchboardAddress: string,
    readonly coinType: string = '0x2::sui::SUI'
  ) {}

  async loadData(): Promise<any> {
    const result = await this.provider.getObject({
      id: this.address,
      options: {
        showType: true,
        showContent: true,
        showOwner: true,
      },
    });
    const childFields = await getDynamicChildren(this.provider, this.address);
    const agg = {
      ...childFields,
      ...getObjectFields(result),
    };
    replaceObj(agg);
    return agg;
  }

  async loadJobs(): Promise<Array<OracleJob>> {
    const data = await this.loadData();
    const jobs = data.job_keys.map(
      (key: any) => new JobAccount(this.provider, key, this.switchboardAddress)
    );
    const promises: Array<Promise<OracleJob>> = [];
    for (const job of jobs) {
      promises.push(job.loadJob());
    }
    return await Promise.all(promises);
  }

  /**
   * Initialize an Aggregator
   * @param client
   * @param account
   * @param params AggregatorInitParams initialization params
   */
  static async init(
    provider: JsonRpcProvider,
    signer: Keypair,
    params: AggregatorInitParams,
    switchboardAddress: string
  ): Promise<[AggregatorAccount, SuiTransactionBlockResponse]> {
    const { mantissa: vtMantissa, scale: vtScale } = SuiDecimal.fromBig(
      params.varianceThreshold ?? new Big(0)
    );
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${switchboardAddress}::aggregator_init_action::run`,
      arguments: [
        tx.pure(params.name, 'vector<u8>'),
        tx.object(params.queueAddress),
        tx.pure(params.batchSize, 'u64'),
        tx.pure(params.minOracleResults, 'u64'),
        tx.pure(params.minJobResults, 'u64'),
        tx.pure(params.minUpdateDelaySeconds, "u64'"),
        tx.pure(vtMantissa, 'u128'),
        tx.pure(vtScale, 'u8'),
        tx.pure(params.forceReportPeriod ?? 0, "u64'"),
        tx.pure(params.disableCrank ?? false),
        tx.pure(params.historySize ?? 0, 'u64'),
        tx.pure(params.readCharge ?? 0, "u64'"),
        tx.pure(
          params.rewardEscrow
            ? params.rewardEscrow
            : signer.getPublicKey().toSuiAddress(),
          'address'
        ),
        tx.pure(params.readWhitelist ?? [], 'vector<address>'),
        tx.pure(params.limitReadsToWhitelist ?? false),
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.pure(params.authority, 'address'),
      ],
      typeArguments: [params.coinType ?? '0x2::sui::SUI'],
    });
    const signerWithProvider = new RawSigner(signer, provider);
    const result = await sendSuiTx(signerWithProvider, tx);
    const aggId = getObjectIdFromResponse(result, 'aggregator::Aggregator');
    return [
      new AggregatorAccount(
        provider,
        aggId,
        switchboardAddress,
        params.coinType ?? '0x2::sui::SUI'
      ),
      result,
    ];
  }

  async latestValue(): Promise<number> {
    const data = await this.loadData();
    replaceObj(data);
    return new SuiDecimal(
      data.update_data.latest_result.value.toString(),
      data.update_data.latest_result.dec,
      Boolean(data.update_data.latest_result.neg)
    )
      .toBig()
      .toNumber();
  }

  async addJob(
    signer: Keypair,
    params: AggregatorAddJobParams
  ): Promise<SuiTransactionBlockResponse> {
    const signerWithProvider = new RawSigner(signer, this.provider);
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_add_job_action::run`,
      arguments: [
        tx.object(this.address),
        tx.object(params.job),
        tx.pure(params.weight || 1, 'u64'),
      ],
    });
    return sendSuiTx(signerWithProvider, tx);
  }

  addJobTx(
    params: Omit<AggregatorAddJobParams & JobInitParams, 'job'>
  ): TransactionBlock {
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::create_and_add_job_action::run`,
      arguments: [
        tx.object(this.address),
        tx.pure(params.name, 'vector<u8>'),
        tx.pure(params.data, 'vector<u8>'),
        tx.pure(params.weight || 1, 'u64'),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  removeJobTx(params: AggregatorAddJobParams): TransactionBlock {
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_remove_job_action::run`,
      arguments: [tx.object(this.address), tx.object(params.job)],
    });
    return tx;
  }

  async saveResult(
    signer: Keypair,
    params: AggregatorSaveResultParams
  ): Promise<SuiTransactionBlockResponse> {
    const {
      mantissa: valueMantissa,
      scale: valueScale,
      neg: valueNeg,
    } = SuiDecimal.fromBig(params.value);

    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_save_result_action::run`,
      arguments: [
        tx.object(params.oracleAddress),
        tx.pure(params.oracleIdx, 'u64'),
        tx.object(this.address),
        tx.object(params.queueAddress),
        tx.pure(valueMantissa, 'u128'),
        tx.pure(valueScale, 'u8'),
        tx.pure(valueNeg, 'bool'),
        tx.object(SUI_CLOCK_OBJECT_ID), // TODO Replace with Clock
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    const signerWithProvider = new RawSigner(signer, this.provider);
    return sendSuiTx(signerWithProvider, tx);
  }

  async openInterval(
    signer: Keypair,
    loadCoin: string
  ): Promise<SuiTransactionBlockResponse> {
    const aggregatorData = await this.loadData();
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_open_interval_action::run`,
      arguments: [
        tx.object(aggregatorData.queue_addr),
        tx.object(this.address),
        tx.object(loadCoin),
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });

    const signerWithProvider = new RawSigner(signer, this.provider);
    return sendSuiTx(signerWithProvider, tx);
  }

  async openIntervalTx(loadCoin: string): Promise<TransactionBlock> {
    const aggregatorData = await this.loadData();
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_open_interval_action::run`,
      arguments: [
        tx.object(aggregatorData.queue_addr),
        tx.object(this.address),
        tx.object(loadCoin),
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    return tx;
  }

  async setConfigTx(
    params: AggregatorSetConfigParams
  ): Promise<TransactionBlock> {
    const aggregator = await this.loadData();
    const { mantissa: vtMantissa, scale: vtScale } = SuiDecimal.fromBig(
      params.varianceThreshold ?? new Big(0)
    );
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_set_configs_action::run`,
      arguments: [
        tx.object(this.address),
        tx.pure(params.name ?? aggregator.name, 'vector<u8>'),
        tx.pure(params.queueAddress ?? aggregator.queue_addr, 'address'),
        tx.pure(params.batchSize ?? aggregator.batch_size, 'u64'),
        tx.pure(
          params.minOracleResults ?? aggregator.min_oracle_results,
          'u64'
        ),
        tx.pure(params.minJobResults ?? aggregator.min_job_results, 'u64'),
        tx.pure(
          params.minUpdateDelaySeconds ?? aggregator.min_update_delay_seconds,
          'u64'
        ),
        tx.pure(vtMantissa, 'u128'),
        tx.pure(vtScale, 'u8'),
        tx.pure(
          params.forceReportPeriod ?? aggregator.force_report_period,
          'u64'
        ),
        tx.pure(params.disableCrank ?? aggregator.disable_crank, 'bool'),
        tx.pure(params.historySize ?? aggregator.history_size, 'u64'),
        tx.pure(params.readCharge ?? aggregator.read_charge, 'u64'),
        tx.pure(params.rewardEscrow ?? aggregator.reward_escrow, 'address'),
        tx.pure(
          params.readWhitelist ?? aggregator.read_whitelist,
          'vector<address>'
        ),
        tx.pure(
          params.limitReadsToWhitelist ?? aggregator.limit_reads_to_whitelist,
          'bool'
        ),
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    return tx;
  }

  async setConfig(
    signer: Keypair,
    params: AggregatorSetConfigParams
  ): Promise<SuiTransactionBlockResponse> {
    const aggregator = await this.loadData();
    // TODO: this looks wrong
    const { mantissa: vtMantissa, scale: vtScale } = SuiDecimal.fromBig(
      params.varianceThreshold ?? new Big(0)
    );
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_set_configs_action::run`,
      arguments: [
        tx.object(this.address),
        tx.pure(params.name ?? aggregator.name, 'vector<u8>'),
        tx.pure(params.queueAddress ?? aggregator.queue_addr, 'address'),
        tx.pure(params.batchSize ?? aggregator.batch_size, 'u64'),
        tx.pure(
          params.minOracleResults ?? aggregator.min_oracle_results,
          'u64'
        ),
        tx.pure(params.minJobResults ?? aggregator.min_job_results, 'u64'),
        tx.pure(
          params.minUpdateDelaySeconds ?? aggregator.min_update_delay_seconds,
          'u64'
        ),
        tx.pure(vtMantissa, 'u128'),
        tx.pure(vtScale, 'u8'),
        tx.pure(
          params.forceReportPeriod ?? aggregator.force_report_period,
          'u64'
        ),
        tx.pure(params.disableCrank ?? aggregator.disable_crank, 'bool'),
        tx.pure(params.historySize ?? aggregator.history_size, 'u64'),
        tx.pure(params.readCharge ?? aggregator.read_charge, 'u64'),
        tx.pure(params.rewardEscrow ?? aggregator.reward_escrow, 'address'),
        tx.pure(
          params.readWhitelist ?? aggregator.read_whitelist,
          'vector<address>'
        ),
        tx.pure(
          params.limitReadsToWhitelist ?? aggregator.limit_reads_to_whitelist,
          'bool'
        ),
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    const signerWithProvider = new RawSigner(signer, this.provider);
    return sendSuiTx(signerWithProvider, tx);
  }

  async setAuthorityTx(authority: string): Promise<TransactionBlock> {
    const aggregatorData = await this.loadData();
    const authorityInfo = (
      await getAggregatorAuthorities(this.provider, aggregatorData.authority)
    ).find((a) => a.aggregatorAddress === this.address);
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_set_authority_action::run`,
      arguments: [
        tx.object(this.address),
        tx.object(authorityInfo.authorityObjectId),
        tx.pure(authority, 'address'),
      ],
    });
    return tx;
  }

  static watch(
    provider: JsonRpcProvider,
    switchboardAddress: string,
    callback: EventCallback
  ): SuiEvent {
    const event = new SuiEvent(
      provider,
      switchboardAddress,
      `aggregator_save_result_action`,
      `MoveEvent`,
      `${switchboardAddress}::events::AggregatorUpdateEvent`
    );
    event.onTrigger(callback);
    return event;
  }

  static async shouldReportValue(
    value: Big,
    aggregator: any
  ): Promise<boolean> {
    const timestamp = new BN(Math.round(Date.now() / 1000), 10);
    const varianceThreshold: Big = new SuiDecimal(
      aggregator.variance_threshold.value.toString(10),
      aggregator.variance_threshold.dec,
      Boolean(aggregator.variance_threshold.neg)
    ).toBig();
    const latestResult: Big = new SuiDecimal(
      aggregator.update_data.latest_result.value.toString(),
      aggregator.update_data.latest_result.result.dec,
      Boolean(aggregator.update_data.latest_result.neg)
    ).toBig();
    const forceReportPeriod = new BN(aggregator.force_report_period, 10);
    const lastTimestamp = new BN(aggregator.update_data.latest_timestamp, 10);
    if (lastTimestamp.add(forceReportPeriod).lt(timestamp)) {
      return true;
    }

    let diff = safeDiv(latestResult, value);
    if (diff.abs().gt(1)) {
      diff = safeDiv(value, latestResult);
    }
    // I dont want to think about variance percentage when values cross 0.
    // Changes the scale of what we consider a "percentage".
    if (diff.lt(0)) {
      return true;
    }
    const change = new Big(1).minus(diff);
    return change.gt(varianceThreshold);
  }

  /**
   * Extend a lease
   * @param params LeaseExtendParams
   */
  async extend(
    signer: Keypair,
    params: LeaseExtendParams
  ): Promise<SuiTransactionBlockResponse> {
    const queueAddress: string = (await this.loadData()).queue_addr;
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_escrow_deposit_action::run`,
      arguments: [
        tx.object(queueAddress),
        tx.object(this.address),
        tx.object(params.loadCoinId),
        tx.pure(params.loadAmount),
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    const signerWithProvider = new RawSigner(signer, this.provider);
    return sendSuiTx(signerWithProvider, tx);
  }

  /**
   * Extend a lease tx
   * @param params LeaseExtendParams
   */
  async extendTx(params: LeaseExtendParams): Promise<TransactionBlock> {
    const queueAddress: string = (await this.loadData()).queue_addr;
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_escrow_deposit_action::run`,
      arguments: [
        tx.object(queueAddress),
        tx.object(this.address),
        tx.object(params.loadCoinId),
        tx.pure(params.loadAmount),
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    return tx;
  }

  async withdraw(
    signer: Keypair,
    params: LeaseWithdrawParams
  ): Promise<SuiTransactionBlockResponse> {
    const queueAddress: string = (await this.loadData()).queue_addr;
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_escrow_withdraw_action::run`,
      arguments: [
        tx.object(queueAddress),
        tx.object(this.address),
        tx.pure(params.amount),
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    const signerWithProvider = new RawSigner(signer, this.provider);
    return sendSuiTx(signerWithProvider, tx);
  }

  /**
   * withdraw a lease tx
   * @param params LeaseWithdrawParams
   */
  async withdrawTx(params: LeaseWithdrawParams): Promise<TransactionBlock> {
    const queueAddress: string = (await this.loadData()).queue_addr;
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::aggregator_escrow_withdraw_action::run`,
      arguments: [
        tx.object(queueAddress),
        tx.object(this.address),
        tx.pure(params.amount),
      ],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    return tx;
  }

  /**
   * Push feed to the crank
   * @param params CrankPushParams
   */
  async crankPushTx(): Promise<TransactionBlock> {
    const queueAddress: string = (await this.loadData()).queue_addr;
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.switchboardAddress}::crank_push_action::run`,
      arguments: [tx.object(queueAddress), tx.object(this.address)],
      typeArguments: [this.coinType ?? '0x2::sui::SUI'],
    });
    return tx;
  }

  /**
   * check that a feed is on the crank
   */
  async isOnCrank(): Promise<boolean> {
    const queueAddress: string = (await this.loadData()).queue_addr;
    const queueAccount = new OracleQueueAccount(
      this.provider,
      queueAddress,
      this.switchboardAddress
    );
    const queueData = await queueAccount.loadData();
    const crankable = queueData.crank_feeds;
  }
}

export class JobAccount {
  constructor(
    readonly provider: JsonRpcProvider,
    readonly address: string,
    readonly switchboardAddress: string
  ) {}

  async loadData(): Promise<any> {
    const result = await this.provider.getObject({
      id: this.address,
      options: {
        showType: true,
        showContent: true,
        showOwner: true,
      },
    });
    const job = getObjectFields(result);
    return { ...job };
  }

  async loadJob(): Promise<OracleJob> {
    const data = await this.loadData();
    const job = OracleJob.decodeDelimited(Buffer.from(data.data, 'base64'));
    return job;
  }

  /**
   * Initialize a JobAccount

   * @param params JobInitParams initialization params
   */
  static async init(
    provider: JsonRpcProvider,
    signer: Keypair,
    params: JobInitParams,
    switchboardAddress: string
  ): Promise<[JobAccount, SuiTransactionBlockResponse]> {
    const tx = getSuiMoveCall(`${switchboardAddress}::job_init_action::run`, [
      params.name,
      params.data,
      SUI_CLOCK_OBJECT_ID,
    ]);

    const signerWithProvider = new RawSigner(signer, provider);
    const result = await sendSuiTx(signerWithProvider, tx);

    let jobId = getObjectIdFromResponse(result, 'job::Job');

    return [new JobAccount(provider, jobId, switchboardAddress), result];
  }

  /**
   * Initialize a JobAccount
   * @param client
   * @param account
   * @param params JobInitParams initialization params
   */
  static initTx(
    params: JobInitParams,
    switchboardAddress: string
  ): TransactionBlock {
    const tx = getSuiMoveCall(`${switchboardAddress}::job_init_action::run`, [
      params.name,
      params.data,
      SUI_CLOCK_OBJECT_ID,
    ]);
    return tx;
  }
}

export class OracleAccount {
  constructor(
    readonly provider: JsonRpcProvider,
    readonly address: string,
    readonly switchboardAddress: string,
    readonly coinType: string = '0x2::sui::SUI'
  ) {}

  /**
   * Initialize a Oracle
   * @param client
   * @param account
   * @param params Oracle initialization params
   */
  static async init(
    provider: JsonRpcProvider,
    signer: Keypair,
    params: OracleInitParams,
    switchboardAddress: string
  ): Promise<[OracleAccount, SuiTransactionBlockResponse]> {
    const tx = getSuiMoveCall(
      `${switchboardAddress}::oracle_init_action::run`,
      [params.name, params.authority, params.queue],
      [params.coinType ?? '0x2::sui::SUI']
    );

    const signerWithProvider = new RawSigner(signer, provider);
    const result = await sendSuiTx(signerWithProvider, tx);

    const oracleId = getObjectIdFromResponse(result, `oracle::Oracle`);

    return [
      new OracleAccount(
        provider,
        oracleId,
        switchboardAddress,
        params.coinType ?? '0x2::sui::SUI'
      ),
      result,
    ];
  }

  async loadData(): Promise<any> {
    const result = await this.provider.getObject({
      id: this.address,
      options: {
        showType: true,
        showContent: true,
        showOwner: true,
      },
    });
    const childFields = await getDynamicChildren(this.provider, this.address);
    const oracleData = {
      ...childFields,
      ...getObjectFields(result),
    };
    replaceObj(oracleData);
    return oracleData;
  }

  /**
   * Oracle Heartbeat Action
   */
  async heartbeat(
    signer: Keypair,
    queueId: string
  ): Promise<SuiTransactionBlockResponse> {
    const tx = getSuiMoveCall(
      `${this.switchboardAddress}::oracle_heartbeat_action::run`,
      [this.address, queueId, SUI_CLOCK_OBJECT_ID],
      [this.coinType]
    );
    const signerWithProvider = new RawSigner(signer, this.provider);
    return sendSuiTx(signerWithProvider, tx);
  }

  async withdraw(
    signer: Keypair,
    params: EscrowWithdrawParams
  ): Promise<SuiTransactionBlockResponse> {
    const queueAddress: string = (await this.loadData()).queue_addr;
    const tx = getSuiMoveCall(
      `${this.switchboardAddress}::oracle_escrow_withdraw_action::run`,
      [queueAddress, this.address, params.amount],
      [this.coinType]
    );
    const signerWithProvider = new RawSigner(signer, this.provider);
    return sendSuiTx(signerWithProvider, tx);
  }
}

export class OracleQueueAccount {
  constructor(
    readonly provider: JsonRpcProvider,
    readonly address: string,
    readonly switchboardAddress: string,
    readonly coinType: string = '0x2::sui::SUI'
  ) {}

  /**
   * Initialize an OracleQueueAccount
   */
  static async init(
    provider: JsonRpcProvider,
    signer: Keypair,
    params: OracleQueueInitParams,
    switchboardAddress: string
  ): Promise<[OracleQueueAccount, SuiTransactionBlockResponse]> {
    const tx = getSuiMoveCall(
      `${switchboardAddress}::oracle_queue_init_action::run`,
      [
        params.authority,
        params.name,
        `${params.oracleTimeout}`,
        `${params.reward}`,
        params.unpermissionedFeedsEnabled,
        params.lockLeaseFunding,
        `${params.maxSize ?? 100}`,
        SUI_CLOCK_OBJECT_ID,
      ],
      [params.coinType ?? '0x2::sui::SUI']
    );

    const signerWithProvider = new RawSigner(signer, provider);
    const result = await sendSuiTx(signerWithProvider, tx);
    const queueId = getObjectIdFromResponse(
      result,
      `oracle_queue::OracleQueue<0x2::sui::SUI>`
    );
    return [
      new OracleQueueAccount(
        provider,
        queueId,
        switchboardAddress,
        params.coinType ?? '0x2::sui::SUI'
      ),
      result,
    ];
  }

  async findOracleIdx(oracleAddress: string): Promise<number> {
    const queueData = await this.loadData();
    const oracles = queueData.data;
    const idx = oracles.findIndex((o: string) => o === oracleAddress);
    return idx;
  }

  async setConfigs(
    signer: Keypair,
    params: OracleQueueSetConfigsParams
  ): Promise<SuiTransactionBlockResponse> {
    const tx = getSuiMoveCall(
      `${this.switchboardAddress}::oracle_queue_set_configs_action::run`,
      [
        this.address,
        params.name,
        params.authority,
        `${params.oracleTimeout}`,
        `${params.reward}`,
        `${params.unpermissionedFeedsEnabled}`,
        `${params.lockLeaseFunding}`,
      ],
      [params.coinType ?? '0x2::sui::SUI']
    );
    const signerWithProvider = new RawSigner(signer, this.provider);
    return sendSuiTx(signerWithProvider, tx);
  }

  async loadData(): Promise<any> {
    const result = await this.provider.getObject({
      id: this.address,
      options: {
        showType: true,
        showContent: true,
        showOwner: true,
      },
    });
    const childFields = await getDynamicChildren(this.provider, this.address);
    const queueData = {
      ...childFields,
      ...getObjectFields(result),
    };
    replaceObj(queueData);
    return queueData;
  }
}

export class Permission {
  constructor(
    readonly provider: JsonRpcProvider,
    readonly queueId: string, // object id of the queue
    readonly targetId: string, // id of the oracle or aggregator
    readonly objectId: string, // optional
    readonly switchboardAddress: string,
    readonly coinType: string = '0x2::sui::SUI'
  ) {}

  async loadData(): Promise<any> {
    // get queue data
    const result = await this.provider.getObject({
      id: this.queueId,
      options: {
        showType: true,
        showContent: true,
        showOwner: true,
      },
    });

    // so we can get the permissions object
    const fields = getFieldsFromObjectResponse(result);

    // get permissions object
    const permissionsId = fields.permissions;

    // We'd have to grab the permissions object from the child results
    // and then get the fields from that object
    sha3_256('permissions');

    const childResults = await this.provider.getDynamicFieldObject({
      parentId: permissionsId,
      name: 'permissions',
    });

    throw new Error('not implemented');
  }

  /**
   * Initialize a Permission
   * @param params PermissionInitParams initialization params
   */
  static async init(
    provider: JsonRpcProvider,
    signer: Keypair,
    params: PermissionInitParams,
    switchboardAddress: string,
    coinType: string = '0x2::sui::SUI'
  ): Promise<[Permission, SuiTransactionBlockResponse]> {
    const tx = getSuiMoveCall(
      `${switchboardAddress}::permission_init_action::run`,
      [params.authority, params.granter, params.grantee]
    );

    const signerWithProvider = new RawSigner(signer, provider);
    const result = await sendSuiTx(signerWithProvider, tx);
    const permissionId = getObjectIdFromResponse(
      result,
      `permission::Permission`
    );
    return [
      new Permission(
        provider,
        params.queueId,
        params.objectId,
        permissionId,
        switchboardAddress,
        coinType ?? '0x2::sui::SUI'
      ),
      result,
    ];
  }

  /**
   * Set a Permission
   */
  static async set(
    provider: JsonRpcProvider,
    signer: Keypair,
    params: PermissionSetParams,
    switchboardAddress: string
  ): Promise<SuiTransactionBlockResponse> {
    const tx = getSuiMoveCall(
      `${switchboardAddress}::permission_set_action::run`,
      [
        params.authority,
        params.granter,
        params.grantee,
        params.permission,
        params.enable,
      ]
    );
    const signerWithProvider = new RawSigner(signer, provider);
    return sendSuiTx(signerWithProvider, tx);
  }
}

function safeDiv(number_: Big, denominator: Big, decimals = 20): Big {
  const oldDp = Big.DP;
  Big.DP = decimals;
  const result = number_.div(denominator);
  Big.DP = oldDp;
  return result;
}

interface CreateFeedParams extends AggregatorInitParams {
  jobs: JobInitParams[];
  loadCoin: string;
  initialLoadAmount: number;
}

interface CreateOracleParams extends OracleInitParams {
  loadCoin: string;
  loadAmount: number;
}

export async function createFeedTx(
  params: CreateFeedParams,
  switchboardAddress: string
): Promise<TransactionBlock> {
  if (params.jobs.length > 8) {
    throw new Error(
      'Max Job limit exceeded. The create_feed_action can only create up to 8 jobs at a time.'
    );
  }
  const { mantissa: vtMantissa, scale: vtScale } = SuiDecimal.fromBig(
    params.varianceThreshold ?? new Big(0)
  );
  const jobs =
    params.jobs.length < 8
      ? [
          ...params.jobs,
          ...new Array<JobInitParams>(8 - params.jobs.length).fill({
            name: '',
            data: [],
            weight: 1,
          }),
        ]
      : params.jobs;

  return getSuiMoveCall(
    `${switchboardAddress}::create_feed_action::run`,
    [
      params.authority,
      SUI_CLOCK_OBJECT_ID,
      params.name,
      params.queueAddress,
      `${params.batchSize}`,
      `${params.minOracleResults}`,
      `${params.minJobResults}`,
      `${params.minUpdateDelaySeconds}`,
      vtMantissa,
      `${vtScale}`,
      `${params.forceReportPeriod ?? 0}`,
      params.disableCrank ?? false,
      `${params.historySize ?? 0}`,
      `${params.readCharge ?? 0}`,
      params.rewardEscrow ?? params.authority,
      params.readWhitelist ?? [],
      params.limitReadsToWhitelist ?? false,

      params.loadCoin,
      params.initialLoadAmount.toString(),

      // jobs
      ...jobs.flatMap((jip) => {
        return [jip.name, jip.data, `${jip.weight || 1}`];
      }),
    ],
    [params.coinType ?? '0x2::sui::SUI']
  );
}

// Create a feed with jobs, a lease, then optionally push the lease to the specified crank
export async function createFeed(
  provider: JsonRpcProvider,
  signer: Keypair,
  params: CreateFeedParams,
  switchboardAddress: string
): Promise<[AggregatorAccount, SuiTransactionBlockResponse]> {
  const txn = await createFeedTx(params, switchboardAddress);
  const signerWithProvider = new RawSigner(signer, provider);
  const result = await sendSuiTx(signerWithProvider, txn);
  const aggId = getObjectIdFromResponse(result, 'aggregator::Aggregator');
  return [
    new AggregatorAccount(
      provider,
      aggId,
      switchboardAddress,
      params.coinType ?? '0x2::sui::SUI'
    ),
    result,
  ];
}

// Create an oracle, oracle wallet, permisison, and set the heartbeat permission if user is the queue authority
export async function createOracle(
  provider: JsonRpcProvider,
  signer: Keypair,
  params: CreateOracleParams,
  switchboardAddress: string
): Promise<[OracleAccount, SuiTransactionBlockResponse]> {
  const tx = getSuiMoveCall(
    `${switchboardAddress}::create_oracle_action::run`,
    [
      params.name,
      params.authority,
      params.queue,
      params.loadCoin,
      `${params.loadAmount}`,
      SUI_CLOCK_OBJECT_ID, // TODO Replace with Clock
    ],
    [params.coinType ?? '0x2::sui::SUI']
  );

  const signerWithProvider = new RawSigner(signer, provider);
  const result = await sendSuiTx(signerWithProvider, tx);
  const oracleId = getObjectIdFromResponse(result, `oracle::Oracle`);
  return [
    new OracleAccount(
      provider,
      oracleId,
      switchboardAddress,
      params.coinType ?? '0x2::sui::SUI'
    ),
    result,
  ];
}

async function getDynamicChildren(provider: JsonRpcProvider, objectId: string) {
  const childResults = await provider.getDynamicFields({
    parentId: objectId,
  });
  const children = await Promise.all(
    childResults.data.map(async (res) => {
      const data = await provider.getObject({
        id: res.objectId,
        options: {
          showType: true,
          showContent: true,
          showOwner: true,
        },
      });
      return getObjectFields(data);
    })
  );
  const r = await Promise.all(
    children.map(async (res) => {
      return res;
    })
  );

  // smash the data into the same object
  const data = r.reduce((prev, curr) => {
    return {
      ...curr,
      ...prev,
    };
  }, {});
  return data;
}

export async function getAggregatorAuthorities(
  provider: JsonRpcProvider,
  userAddress: string
): Promise<
  {
    aggregatorAddress: string; // aggregator address
    authorityObjectId: string; // registered authority objectId for the aggregator
  }[]
> {
  const objectsOwnedByUser = await provider.getObjectsOwnedByAddress(
    userAddress
  );
  const authorityInfoObjects = objectsOwnedByUser.filter((obj) =>
    obj.type.endsWith('aggregator::Authority')
  );
  const authorityData = await provider.getObjectBatch(
    authorityInfoObjects.map((obj) => obj.objectId)
  );

  return authorityData.map((obj, idx) => {
    const resp = getObjectExistsResponse(obj);
    if ('fields' in resp.data) {
      return {
        aggregatorAddress: resp.data.fields.aggregator_address as string,
        authorityObjectId: authorityInfoObjects[idx].objectId,
      };
    } else throw new Error('Err getting Authorities');
  });
}

export function getFieldsFromObjectResponse(
  response: SuiObjectResponse
): Record<string, any> {
  if ('content' in response.data && 'fields' in response.data.content) {
    return response.data.content.fields;
  } else throw new Error('Err getting fields');
}

export function getObjectIdFromResponse(
  response: SuiTransactionBlockResponse,
  type: string
): string {
  response.objectChanges?.forEach((obj) => {
    if (obj.type == 'created' && obj.objectType.endsWith(type)) {
      return obj.objectId;
    }
  });
  throw new Error('Could not find object id');
}
