import type { PrismaClient } from '@prisma/client';
import { TransactionRepository } from '../../business/repositories/transaction.repo.js';
import { SettlementRepository } from '../../business/repositories/settlement.repo.js';
import { MerchantRepository } from '../../business/repositories/merchant.repo.js';
import {
  qztToInternal,
  parseQztContent,
  type QztFileType,
} from '../adapters/qzt.adapter.js';

export interface ProcessResult {
  success: boolean;
  records: number;
  fileId?: string;
  error?: string;
}

export class BffFileService {
  private transactionRepo: TransactionRepository;
  private settlementRepo: SettlementRepository;
  private merchantRepo: MerchantRepository;

  constructor(private prisma: PrismaClient) {
    this.transactionRepo = new TransactionRepository(prisma);
    this.settlementRepo = new SettlementRepository(prisma);
    this.merchantRepo = new MerchantRepository(prisma);
  }

  async processFile(
    content: string,
    filename: string,
    merchantId: string,
    fileType: QztFileType
  ): Promise<ProcessResult> {
    try {
      // 1. 解析钱账通原始数据
      const records = parseQztContent(content, fileType);
      if (records.length === 0) {
        return { success: true, records: 0, fileId: `${fileType}_${Date.now()}` };
      }

      // 2. 转换格式并保存
      let savedCount = 0;
      for (const record of records) {
        const internalRecord = qztToInternal(record, fileType);
        await this.saveByType(fileType, merchantId, internalRecord);
        savedCount++;
      }

      return {
        success: true,
        records: savedCount,
        fileId: `${fileType}_${Date.now()}`,
      };
    } catch (err: any) {
      return { success: false, records: 0, error: err.message };
    }
  }

  private async saveByType(fileType: QztFileType, merchantId: string, record: any) {
    switch (fileType) {
      case 'JY':
        await this.transactionRepo.saveJyTransaction(merchantId, record);
        break;
      case 'JS':
        await this.settlementRepo.saveJsSettlement(merchantId, record);
        break;
      case 'JZ':
        await this.settlementRepo.saveJzWalletSettlement(merchantId, record);
        break;
      case 'ACC':
        await this.settlementRepo.saveAccAccountSettlement(merchantId, record);
        break;
      case 'SEP':
        await this.settlementRepo.saveSepTransaction(merchantId, record);
        break;
      // 其他类型暂不处理
    }
  }
}
