import { PrismaClient } from '@prisma/client';

export class SettlementRepository {
  constructor(private prisma: PrismaClient) {}

  async saveJsSettlement(merchantId: string, data: any) {
    return this.prisma.jsSettlement.upsert({
      where: {
        merchantId_lakala_serial_settle_date: {
          merchantId,
          lakala_serial: data.lakala_serial,
          settle_date: data.settle_date,
        },
      },
      update: {},
      create: {
        merchantId,
        trans_date: data.trans_date,
        trans_time: data.trans_time,
        terminal_no: data.terminal_no,
        lakala_serial: data.lakala_serial,
        amount: BigInt(data.amount || 0),
        fee: BigInt(data.fee || 0),
        settle_amount: BigInt(data.settle_amount || 0),
        settle_date: data.settle_date,
        settle_status: data.settle_status || 0,
      },
    });
  }

  async saveJzWalletSettlement(merchantId: string, data: any) {
    return this.prisma.jzWalletSettlement.upsert({
      where: {
        merchantId_settle_date_wallet_type: {
          merchantId,
          settle_date: data.settle_date,
          wallet_type: data.wallet_type,
        },
      },
      update: {},
      create: {
        merchantId,
        settle_date: data.settle_date,
        wallet_type: data.wallet_type,
        amount: BigInt(data.amount || 0),
        fee: BigInt(data.fee || 0),
        settle_amount: BigInt(data.settle_amount || 0),
      },
    });
  }

  async saveAccAccountSettlement(merchantId: string, data: any) {
    return this.prisma.accAccountSettlement.upsert({
      where: {
        merchantId_account_no_settle_date: {
          merchantId,
          account_no: data.account_no,
          settle_date: data.settle_date,
        },
      },
      update: {},
      create: {
        merchantId,
        account_no: data.account_no,
        settle_date: data.settle_date,
        amount: BigInt(data.amount || 0),
        fee: BigInt(data.fee || 0),
        settle_amount: BigInt(data.settle_amount || 0),
      },
    });
  }

  async saveSepTransaction(merchantId: string, data: any) {
    return this.prisma.sepTransaction.upsert({
      where: {
        merchantId_lakala_serial: { merchantId, lakala_serial: data.lakala_serial },
      },
      update: {},
      create: {
        merchantId,
        trans_date: data.trans_date,
        lakala_serial: data.lakala_serial,
        amount: BigInt(data.amount || 0),
        sep_amount: BigInt(data.sep_amount || 0),
        sep_rate: data.sep_rate || 0,
      },
    });
  }
}
