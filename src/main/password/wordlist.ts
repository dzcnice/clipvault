/**
 * Passphrase 词表（Sprint 11 · TASK-058）
 *
 * 精简版：256 个常用英文单词 + 256 个常用汉字。
 * 长度为 256（2^8）便于 randomInt(0, 256) 均匀抽取。
 */

/** 256 常用英文单词 */
export const EN_WORDS: readonly string[] = [
  'able', 'acid', 'aged', 'also', 'area', 'army', 'away', 'baby',
  'back', 'ball', 'band', 'bank', 'base', 'bath', 'bear', 'beat',
  'been', 'beer', 'bell', 'belt', 'best', 'bike', 'bird', 'blow',
  'blue', 'boat', 'body', 'bomb', 'bond', 'bone', 'book', 'boom',
  'born', 'boss', 'both', 'bowl', 'bulk', 'burn', 'bush', 'busy',
  'calm', 'came', 'camp', 'card', 'care', 'case', 'cash', 'cast',
  'cell', 'chat', 'chip', 'city', 'club', 'coal', 'coat', 'code',
  'cold', 'come', 'cook', 'cool', 'cope', 'copy', 'core', 'cost',
  'crew', 'crop', 'dark', 'data', 'date', 'dawn', 'days', 'dead',
  'deal', 'dean', 'dear', 'debt', 'deep', 'deny', 'desk', 'dial',
  'dice', 'dirt', 'disk', 'done', 'door', 'dose', 'down', 'draw',
  'drew', 'drop', 'drug', 'drum', 'dual', 'duck', 'dust', 'duty',
  'each', 'earn', 'ease', 'east', 'easy', 'edge', 'else', 'even',
  'ever', 'evil', 'exit', 'face', 'fact', 'fail', 'fair', 'fall',
  'farm', 'fast', 'fate', 'fear', 'feed', 'feel', 'fell', 'felt',
  'file', 'fill', 'film', 'find', 'fine', 'fire', 'firm', 'fish',
  'five', 'flag', 'flat', 'flew', 'flow', 'food', 'foot', 'ford',
  'form', 'fort', 'four', 'free', 'from', 'fuel', 'full', 'fund',
  'gain', 'game', 'gate', 'gave', 'gear', 'gene', 'gift', 'girl',
  'give', 'glad', 'goal', 'goes', 'gold', 'gone', 'good', 'gray',
  'grew', 'grow', 'gulf', 'hair', 'half', 'hall', 'hand', 'hang',
  'hard', 'harm', 'hate', 'have', 'head', 'hear', 'heat', 'held',
  'hell', 'help', 'here', 'hero', 'high', 'hill', 'hint', 'hire',
  'hold', 'hole', 'holy', 'home', 'hope', 'hour', 'huge', 'hung',
  'hunt', 'hurt', 'idea', 'inch', 'into', 'iron', 'item', 'jack',
  'jade', 'jazz', 'join', 'jump', 'jury', 'just', 'keen', 'keep',
  'kept', 'kick', 'kill', 'kind', 'king', 'knee', 'knew', 'know',
  'lack', 'lady', 'laid', 'lake', 'land', 'lane', 'last', 'late',
  'lawn', 'lazy', 'lead', 'leaf', 'lean', 'left', 'lend', 'less',
  'life', 'lift', 'like', 'line', 'link', 'lion', 'lisp', 'list',
  'live', 'load', 'loaf', 'loan', 'lock', 'long', 'look', 'lord',
  'lose', 'loss', 'lost', 'loud', 'love', 'luck', 'made', 'mail'
]

/** 256 常用汉字 */
export const ZH_WORDS: readonly string[] = [
  '安', '八', '白', '百', '班', '板', '半', '帮',
  '包', '保', '报', '杯', '北', '本', '比', '笔',
  '必', '边', '便', '变', '表', '别', '兵', '并',
  '病', '玻', '不', '布', '步', '部', '才', '采',
  '菜', '参', '草', '层', '茶', '查', '差', '产',
  '场', '常', '唱', '车', '成', '城', '吃', '持',
  '尺', '齿', '冲', '虫', '出', '初', '除', '厨',
  '川', '穿', '船', '窗', '床', '春', '词', '次',
  '从', '村', '大', '带', '待', '单', '但', '蛋',
  '当', '刀', '导', '到', '道', '得', '灯', '低',
  '地', '弟', '第', '点', '电', '店', '东', '冬',
  '动', '都', '读', '度', '短', '对', '多', '朵',
  '耳', '二', '发', '法', '番', '方', '房', '放',
  '飞', '非', '分', '风', '丰', '封', '佛', '否',
  '夫', '服', '父', '付', '富', '改', '干', '甘',
  '感', '敢', '刚', '钢', '港', '高', '告', '哥',
  '歌', '格', '给', '根', '跟', '更', '工', '公',
  '共', '狗', '姑', '古', '骨', '顾', '关', '观',
  '光', '广', '规', '国', '果', '过', '孩', '海',
  '含', '寒', '汉', '好', '号', '喝', '河', '和',
  '贺', '黑', '红', '后', '候', '呼', '湖', '花',
  '画', '坏', '还', '换', '黄', '灰', '回', '会',
  '婚', '活', '火', '或', '鸡', '积', '基', '级',
  '极', '几', '记', '家', '甲', '价', '间', '见',
  '江', '讲', '交', '角', '教', '街', '节', '结',
  '姐', '解', '介', '借', '金', '今', '斤', '近',
  '进', '京', '经', '井', '景', '静', '竟', '九',
  '久', '酒', '就', '居', '举', '句', '决', '绝',
  '军', '卡', '开', '看', '康', '考', '科', '可',
  '克', '刻', '客', '课', '空', '口', '苦', '库',
  '快', '宽', '款', '困', '拉', '来', '蓝', '览',
  '郎', '狼', '劳', '老', '乐', '雷', '冷', '理'
]

if (EN_WORDS.length !== 256) {
  throw new Error(`EN_WORDS length = ${EN_WORDS.length}, expected 256`)
}
if (ZH_WORDS.length !== 256) {
  throw new Error(`ZH_WORDS length = ${ZH_WORDS.length}, expected 256`)
}
