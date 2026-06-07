const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const OWNER_ID = 1n;
const SUBJECT_ID = 1n;
const PAPER_TITLE = process.argv.includes('--title')
  ? process.argv[process.argv.indexOf('--title') + 1]
  : '全题验证试卷';

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)));
}

async function ensureDefaults() {
  await prisma.user.upsert({
    where: { id: OWNER_ID },
    update: {},
    create: {
      id: OWNER_ID,
      username: 'admin',
      passwordHash: 'dev-placeholder',
      displayName: '管理员',
    },
  });
  await prisma.subject.upsert({
    where: { id: SUBJECT_ID },
    update: {},
    create: {
      id: SUBJECT_ID,
      ownerId: OWNER_ID,
      name: '数学',
      icon: '📘',
    },
  });
}

async function main() {
  await ensureDefaults();

  const groups = await prisma.questionGroup.findMany({
    where: {
      status: { not: 'DELETED' },
      questions: { some: { status: { not: 'DELETED' } } },
    },
    orderBy: [{ id: 'asc' }],
    include: {
      _count: { select: { questions: true } },
    },
  });

  if (!groups.length) {
    throw new Error('没有可加入试卷的题组');
  }

  const existing = await prisma.paper.findFirst({
    where: { title: PAPER_TITLE, status: { not: 'DELETED' } },
    orderBy: { id: 'asc' },
  });

  const description = `自动聚合题库全部题组，共 ${groups.length} 道大题，用于逐题验证渲染与答题交互。`;

  const paper = existing
    ? await prisma.$transaction(async (tx) => {
        await tx.paperQuestion.deleteMany({ where: { paperId: existing.id } });
        await tx.paper.update({
          where: { id: existing.id },
          data: { description, subjectId: SUBJECT_ID },
        });
        await tx.paperQuestion.createMany({
          data: groups.map((group, index) => ({
            paperId: existing.id,
            groupId: group.id,
            sortOrder: index + 1,
            score: group.score || 1,
          })),
        });
        return tx.paper.findUnique({
          where: { id: existing.id },
          include: { items: true },
        });
      })
    : await prisma.paper.create({
        data: {
          ownerId: OWNER_ID,
          subjectId: SUBJECT_ID,
          title: PAPER_TITLE,
          description,
          items: {
            create: groups.map((group, index) => ({
              groupId: group.id,
              sortOrder: index + 1,
              score: group.score || 1,
            })),
          },
        },
        include: { items: true },
      });

  console.log(JSON.stringify(jsonSafe({
    ok: true,
    paperId: paper.id,
    title: paper.title,
    itemCount: paper.items.length,
    firstItems: groups.slice(0, 8).map((group, index) => ({
      sortOrder: index + 1,
      groupId: group.id,
      title: group.title,
      questionCount: group._count.questions,
    })),
  }), null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
