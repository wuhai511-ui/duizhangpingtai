/**
 * 种子脚本：创建初始商户和用户
 * 运行：npx tsx prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始创建初始数据...');

  // 创建默认商户
  const merchant = await prisma.merchant.upsert({
    where: { merchant_no: 'DEFAULT' },
    update: {},
    create: {
      merchant_no: 'DEFAULT',
      name: '默认商户',
      status: 1,
    },
  });
  console.log('商户创建/已存在:', merchant);

  // 创建用户（手机号 15801852984，密码 123456，merchantId 初始不绑定，由用户在门店管理中自主绑定）
  const user = await prisma.user.upsert({
    where: { phone: '15801852984' },
    update: {},
    create: {
      phone: '15801852984',
      password: '123456',
      name: '测试用户',
      merchantId: null, // 初始不绑定，通过门店管理自主绑定
      status: 1,
    },
  });
  console.log('用户创建/已存在:', { id: user.id, phone: user.phone, name: user.name, merchantId: user.merchantId });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
