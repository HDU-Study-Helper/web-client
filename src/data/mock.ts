import type { User } from '../types'

export const demoUser: User = {
  id: 'local-preview',
  username: 'sky',
  display_name: 'Sky',
  role: 'user',
}
export const academicSnapshot = {
  date: '2026-11-12',
  dateLabel: '2026 年 11 月 12 日 · 周四',
  semester: '2026–2027 · 第一学期',
  week: '第 10 教学周',
  pendingTasks: 3,
  scheduledClasses: 2,
  assistantIntro: '跟进课程、管理任务、解答学习问题。和你一起，把每一天的学习安排好。',
}
export const schedule = [
  {
    id: 'math-class',
    name: '高等数学',
    start: '09:00',
    end: '10:40',
    location: '第 6 教学楼 · 302',
    type: '课程',
    state: 'upcoming',
  },
  {
    id: 'drawing-class',
    name: '工程制图',
    start: '14:00',
    end: '15:40',
    location: '第 3 教学楼 · 201',
    type: '课程',
    state: 'later',
  },
  {
    id: 'self-study',
    name: '自主学习',
    start: '16:00',
    end: '17:00',
    location: '图书馆 · 自习区',
    type: '个人安排',
    state: 'later',
  },
]
export const scheduleDays = [
  '示例 2026 年 11.12 / 周四',
  '示例 2026 年 11.13 / 周五',
  '示例 2026 年 11.14 / 周六',
  '示例 2026 年 11.15 / 周日',
]
export const courses = [
  {
    id: 'math',
    code: 'M',
    name: '高等数学',
    subtitle: 'ADVANCED MATHEMATICS',
    progress: 65,
    task: '例题整理',
    due: '2026-11-15',
    color: 'blue',
    teacher: '陈老师',
    detail: '整理第三章微分中值定理的典型例题，重点复习罗尔定理与拉格朗日中值定理。',
    status: '按计划进行',
  },
  {
    id: 'drawing',
    code: 'E',
    name: '工程制图',
    subtitle: 'ENGINEERING DRAWING',
    progress: 42,
    task: '作业 2',
    due: '2026-11-14',
    color: 'purple',
    teacher: '李老师',
    detail:
      '完成组合体三视图练习，检查线型、尺寸标注与投影关系。示例截止时间：2026-11-14 23:59（北京时间）。',
    status: '临近截止',
  },
  {
    id: 'english',
    code: 'C',
    name: '大学英语',
    subtitle: 'COLLEGE ENGLISH',
    progress: 80,
    task: '阅读报告',
    due: '2026-11-20',
    color: 'green',
    teacher: '王老师',
    detail: '完成 Unit 5 延伸阅读，并撰写一份 300 词左右的阅读报告。',
    status: '按计划进行',
  },
  {
    id: 'programming',
    code: 'P',
    name: '程序设计基础',
    subtitle: 'PROGRAMMING FUNDAMENTALS',
    progress: 58,
    task: '示例周暂无待交任务',
    due: '',
    color: 'orange',
    teacher: '周老师',
    detail: '当前学习内容为数组与函数，可以用课后时间复习课堂练习。',
    status: '按计划进行',
  },
  {
    id: 'physics',
    code: 'F',
    name: '大学物理',
    subtitle: 'COLLEGE PHYSICS',
    progress: 72,
    task: '示例周暂无待交任务',
    due: '',
    color: 'blue',
    teacher: '张老师',
    detail: '当前学习内容为动量守恒与机械能守恒，建议整理公式的适用条件。',
    status: '按计划进行',
  },
]
export type MockCourse = (typeof courses)[number]
export const brief = {
  title: '示例快照有 1 项待办，需要留意',
  description:
    '以 2026-11-12 示例快照为准：《工程制图》作业 2 示例截止时间为 2026-11-14（周六）23:59（北京时间）。',
  suggestion: '自习小建议：先完成三视图的草图。',
}
export const suggestedQuestions = [
  {
    id: 'tasks',
    icon: 'calendar',
    text: '这周有哪些作业要交？',
    prompt: '我这周有哪些作业和截止日期？',
  },
  { id: 'math', icon: 'book', text: '帮我梳理高数的重点', prompt: '帮我总结一下高等数学的重点。' },
  {
    id: 'progress',
    icon: 'trend',
    text: '最近的学习进度怎么样？',
    prompt: '我最近的学习进度怎么样？',
  },
  { id: 'plan', icon: 'target', text: '一起安排这周的学习', prompt: '为我安排这周的学习计划。' },
]
export const chatCopy = {
  welcome: '你好，我是你的学习搭子。',
  welcomeSubtitle: '从一份作业，到整个学期。一起把学习安排好。',
  placeholder: '想一起了解哪项示例课程或任务？',
  note: '本地演示 · 2026-11-12 示例快照',
  delay: 650,
  fallback:
    '收到，我们可以一起把它拆成更小的步骤。\n\n你可以告诉我课程名称、希望完成的内容，以及可用的时间。我会帮你梳理一个清晰的起点。\n\n目前是本地演示，课程与任务固定来自 2026-11-12 示例快照，不读取当前日期。你也可以试试上方的课程、作业或学习计划问题。',
  math: '按 2026-11-12 示例快照所在周，高等数学可以围绕「微分中值定理」复习：\n\n01  罗尔定理：先检查闭区间连续、开区间可导和端点函数值相等这三个条件。\n02  拉格朗日中值定理：理解平均变化率与某一点瞬时变化率的关系。\n03  典型应用：证明不等式、判断函数单调性，以及估计函数值。\n\n建议用 30 分钟复习概念，再用 30 分钟整理两道典型例题。例题整理的示例截止日期是 2026-11-15。',
  plan: '按 2026-11-12 示例快照，为你留了一份示例学习安排（均为北京时间）：\n\n示例 2026-11-12 周四 · 16:00–17:00\n先完成工程制图作业 2 的三视图草图，标出需要确认的尺寸。\n\n示例 2026-11-13 周五 · 预留 60 分钟\n完善线型和尺寸标注，检查投影关系。\n\n示例 2026-11-14 周六 · 预留 45 分钟\n检查并自行提交制图作业，再整理高数例题。\n\n示例 2026-11-15 周日 · 预留 30 分钟\n复盘一周的错题，开始大学英语阅读报告。\n\n这是基于本地示例的建议，没有写入你的真实日程。',
}
export function mockReply(question: string): { text: string; sources: string[] } {
  if (/作业|截止|待办|任务/.test(question))
    return {
      text: `按 ${academicSnapshot.date} 示例快照，你有 ${academicSnapshot.pendingTasks} 项待完成任务：\n\n${courses
        .filter((c) => c.due)
        .map(
          (c, i) =>
            `0${i + 1}  ${c.name} · ${c.task}\n示例截止日期：${c.due}${c.id === 'drawing' ? ' 23:59（北京时间），建议优先完成' : ''}`,
        )
        .join(
          '\n\n',
        )}\n\n可以先完成工程制图，再整理高数例题。为每项任务留出一点检查时间，会更从容。`,
      sources: [`课程任务 · ${academicSnapshot.date} 示例快照`],
    }
  if (/进度|情况/.test(question))
    return {
      text: `按 ${academicSnapshot.date} 示例快照，示例课程均在进行中：\n\n${courses
        .slice(0, 3)
        .map((c) => `${c.name}  ${c.progress}% · ${c.status}`)
        .join(
          '\n',
        )}\n\n大学英语进度较好，可以保持节奏。工程制图进度稍慢，建议优先为即将截止的作业分配时间。\n\n这些百分比来自本地示例，不代表真实平台的学习记录。`,
      sources: [`课程进度 · ${academicSnapshot.date} 示例快照`],
    }
  if (/高数|数学|重点|中值/.test(question))
    return { text: chatCopy.math, sources: [`高等数学 · ${academicSnapshot.date} 示例资料`] }
  if (/计划|安排|规划/.test(question))
    return { text: chatCopy.plan, sources: [`示例安排 · ${academicSnapshot.date} 示例快照`] }
  return { text: chatCopy.fallback, sources: [`本地演示 · ${academicSnapshot.date} 示例快照`] }
}
