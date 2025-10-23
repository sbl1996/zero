# ZERO R 游戏设计总览（整合版 V2.0）

---

## 术语与符号

* **身体属性 Body**：`HP, QiMax, ATK, DEF, AGI, REC`
* **斗气 Qi**：战斗资源，`Qi ∈ [0, QiMax]`
* **斗气本源 BP**：隐藏绝对值，修炼/战斗行为驱动增长
* **境界 Realm**：一级→六级（无小境界），七级→九级（各含“初/中/高/巅”），圣域（“初/中/高/巅/极限”）
* **运转预热**：`F(t)=clamp(t/30s,0,1)`；凡 **Qi 派生**量在预热期按 `F(t)` 缩放
* **韧性 tough**：入减伤端；玩家=1.0，怪物=1.0，BOSS=1.5
* **随机口径**：`roll ~ U[0.8,1.2]`；UI对外四舍五入，内部累计到帧末再取整

---

## 1. 修炼与资源

### 1.1 境界与 BP 区间

为每个（小）境界定义 BP 区间 [BP_min, BP_max]。进度 p（0–1）线性映射到区间：

```
BP_current = BP_min + (BP_max - BP_min) * p
```

**推荐区间（示例，指数式平滑递增）：**

| 大境界 | 小境界        | BP区间（含起止）                               | 备注                       |
| --- | ---------- | --------------------------------------- | ------------------------ |
| 一级  | —          | 100–200                                 |                          |
| 二级  | —          | 200–400                                 |                          |
| 三级  | —          | 400–800                                 |                          |
| 四级  | —          | 800–1,600                               |                          |
| 五级  | —          | 1,600–3,200                             |                          |
| 六级  | —          | 3,200–6,400                             |                          |
| 七级  | 初/中/高/巅    | 6,400–12,800（**每段+1,600**）              |                          |
| 八级  | 初/中/高/巅    | 12,800–25,600（**每段+3,200**）             |                          |
| 九级  | 初/中/高/巅    | 25,600–51,200（**每段+6,400**）             |                          |
| 圣域  | 初/中/高/巅/极限 | 51,200–102,400（前四段均分，**极限=区间顶+20%潜力池**） | 极限潜力池只触发部分被动，不线性推高 QiMax |

### 1.2 身体属性与功法

**身体（地基）**：

```
Body = { HP, QiMax, ATK, DEF, AGI, REC }
```

* 大境界提升采用“**先乘后加**”：
  * HP：+20% & +X，X依次为30/70/100/120/130/230/300/340/1000
  * ATK/DEF/AGI：各 +15% & +4/4/2
  * REC：+20% & +5
* **QiMax 与 BP**：`QiMax = 0.5 * BP_current`
* **初始档案**：境界=**一级**（p=0%），`BP≈100`；
  初始 Body 基线：`HP=100, ATK=10, DEF=10, AGI=10, REC=5`（可按职业细化）
  500 GOLD、生命药水×5、斗气药水×3、初始装备：无

### 1.3 斗气属性（Qi_*）与功法侧重

将 BP 转为单位后按功法自动分配（运转期受 `F(t)`）：

```
unit   = BP_current / K_bp2unit        # K_bp2unit = 5

Qi_ATK = unit * coef_ATK
Qi_DEF = unit * coef_DEF
Qi_AGI = unit * coef_AGI
ATK_final = Body_ATK + F(t)*Qi_ATK
DEF_final = Body_DEF + F(t)*Qi_DEF
AGI_final = Body_AGI + F(t)*Qi_AGI
```

**侧重示例**：
龙血 0.40/0.40/0.20；不死 0.45/0.50/0.05；虎纹 0.50/0.10/0.40；**紫焰** 0.30/0.30/0.15 + **恢复系 0.25**（§4）

### 1.4 修炼、瓶颈与突破

**BP 增长**：

* 冥想每秒钟增长BP
```
ΔBP = K_bp * K_env
K_bp=0.1, K_env：1.0
```

* 消灭怪物可获得BP
* 所有消耗斗气的行为可获得BP，公式如下（过于复杂，暂不启用）
```
ΔBP = K_bp * { K_env * (α * Qi_spent + β * Qi_restored) + K_actions }
K_bp=1e-5, α=1.0, β=0.5（紫焰 β=0.6）
K_env：普通1.0 / Boss1.2 / 木桩0.8 / 野外0.4 / 城内0.3 / 冥想0.2；战后余劲15min ×1.5
K_actions：普攻150 / 受击300 / 完美闪避800 / 终招1200 / 重伤坚持200（境界自适应缩放）
```

**突破**（小境界满即入池）：

* **强行突破**：清空 Qi，`P = (0.08-0.04p) * f_e * buffs`，单次 ≤35%
* **生死战**（战中判定，CD 0.5s）：`P = 0.03 * m_hp * m_chain * m_gap`，单次 ≤25%（暂不使用）
* **天材地宝 / 高人指点**：直接/放大概率（指点 ×1.15，30min 或成功一次失效）
  成功 → 进下一段，按本章**大境界乘加**改造身体；失败 → 保持瓶颈（强突失败 Qi 清零）

---

## 2. 斗气资源系统

### 2.1 运转与预热

进入运转→30s 达满 `F(t)`；动作会消耗 Qi，`Qi < 5%*QiMax` 自动退出；重开需重预热。

### 2.2 消耗与恢复

* **动作消耗**（按 QiMax）：见技能表
* **自然恢复**：

```
Qi/sec = (r0 + r1*REC_final) * state_mult * F_mult
r0=1.0, r1=0.06
state_mult：运转=1.0 / 非运转=1.5 / 冥想=3.0
F_mult：运转=F(t) / 非运转&冥想=1.0
```

* **紫焰·恢复被动**：`REC +20`（Body直加，不受F），Qi 恢复×`(1+0.2F)`；圣域极限：+10 REC 与冥想效率 +5%
* **HP 自然恢复**：`HP/sec = 0.1 * REC_final`；战斗中 ×0.5；Boss 场 ×0.25

### 2.3 斗气防御 & 斗气闪避

* **斗气防御**（运转中自动生效）
  吸收比：`0.90 * F(t)`；单次吸收 ≤ 来伤 60%；**Qi 代价**：吸收值×1.1；Qi 不足则按上限吸收后退出
* **斗气闪避**（主动帧技）
  `P = clamp(0.10 + 0.005*(AGI_final - AGI_enemy_final), 0, 1)`；窗口 0.4s；持续0.7s；消耗 6% QiMax，成功返 4% QiMax

### 2.4 资源回满触发

| 触发        |  HP |  Qi | 说明        |
| --------- | :-: | :-: | --------- |
| **突破成功**  |  ✔  |  ✔  | 过渡到新段后回满  |
| **战败复活**  |  ✔  |  ✔  | 失败结算后返回地图 |
| **胜利**    |  ✖  |  ✖  | 不回满；可直接重赛 |
| **退出/逃跑** |  ✖  |  ✖  | 仅清战斗态，不结算 |

---

## 3. 伤害与对抗

### 3.1 参考防御与穿透

* **DEF_ref(realm_stage)**：七级起点 3,840 → … → 圣域前四段 61,440（固定表，游戏内以查表/插值实现）
* **穿透（敌方）**：`PenPct = clamp(0.05 + 0.01*Realm + 0.03*rank, 0, 0.60)`；`PenFlat` 默认 0（技能/词缀赋予）
* **tough**：玩家=1.0，怪=1.0，BOSS=1.5（地图/词缀可在 0.5–2.0 微调）

### 3.2 结算流程

**命中前**：若在闪避窗口且闪避成功 → 免伤；否则入伤害管线
**物理主干**：

```
raw   = ATK_final * skill.mult * roll(0.8~1.2)
effDF = max(0, DEF_final - PenFlat) * (1 - PenPct) * tough_target

# 平衡点 f=0.5
K     = DEF_ref(realm_stage_target)     # K = f/(1-f) * DEF_ref = DEF_ref
mitig = K / (K + effDF)

dmg   = round(raw * mitig)
```

**斗气防御层**：按 §2.3 规则再行吸收后入 HP
**技能倍率（统一）**：普攻 1.0 / 小 1.6 / 中 2.4 / 大 3.6 / 终招 6.0

---

## 4. 技能与消耗品

### 4.1 技能配置

* 战斗界面 4 槽（可重复装）；资源类型：**无消耗 / Qi 消耗**；资源不足不可施放
* **自动施法**：长按≥1s 进入自动模式；CD 完成即重放；两次触发间隔≥200ms；任一条件不满足即停

### 4.2 基础技能（重写成本）

| 技能                  | 资源                 |  倍率 | 说明                      |
| ------------------- | ------------------ | --: | ----------------------- |
| 随手一击 basic_strike   | Qi 3            | 1.0 | 基本攻击   |
| 蓄力劈砍 charged_cleave | Qi 10  | 1.6 | 单体                      |
| 命运斩击 destiny_slash   | Qi 20 + 20% | 3.5 | 爆发                      |
| 气息调整 focus_breath   | Qi 5  | 0.5 | 命中返还 |

> 需要“终招 6.0 倍率”的职业/剧情技可另行配置为大技能变体或 QTE，仍走 Qi 成本

### 4.3 消耗品（移除 XP/必杀）

| ID                              | 名称         | 功能            |                 单价 |
| ------------------------------- | ---------- | ------------- | -----------------: |
| potionHP                        | 生命药水Ⅰ       | 回复 **100 HP** |                 50 |
| potionQi                        | 斗气药水Ⅰ       | 回复 **120 Qi** |                120 |
| potionQiPlus                    | 斗气药水Ⅱ     | 回复 **240 Qi** |                240 |
| blessGem / soulGem / miracleGem | 祝福/灵魂/奇迹宝石 | 强化素材（§6）      | 1000 / 2000 / 5000 |

**快捷物品栏**（底部 4 槽）：点击即生效，统一 10s 冷却；不同物品分开计时；默认绑定：生命Ⅰ/斗气Ⅰ/斗气Ⅱ/（空）

---

## 5. 装备与强化

### 5.1 槽位与互斥

头盔、左手（盾）、右手（武器）、双手武器（与双持互斥）、铠甲、手套、腰带、戒指、鞋子

### 5.2 强化（主属性）

* `L∈[0,15]`；Flat 与 Percent 双路叠加：
  `FinalMain(L) = round((BaseMain + FlatBonus(L)) * (1 + MainBonus(L)))`
  进度曲线、分段成功率/掉级/材料与金币消耗维持原表（0–4/5–9/10–14）

### 5.3 背包换装

沿用原流：背包页可穿戴/卸下/丢弃（确认弹窗）；换装即时重算面板（含 **QiMax**）

---

## 6. 战斗系统（沿用并对齐 Qi 体系）

### 6.1 流程

进入战斗即启动：玩家即时操作；怪物默认每 **1.6s** 攻击一次；任一方 HP≤0 即结算

### 6.2 退出战斗

按钮或切页即可退出；清状态与计时；不结算掉落与 GOLD；**HP/Qi 不回满**

### 6.3 胜败与自动重赛（改写）

* **胜利**：`GOLD += rewardGold`；BOSS 首杀解锁下一张野外地图；**0.8s** 后普通怪可自动重赛（**不回满 HP/Qi**）；BOSS 留场展示战利品，点击立绘可重赛（不回满）
* **失败**：`GOLD -= floor(GOLD/3)`；随后 **回满 HP 与 Qi** 并返回地图
* **RNG**：统一 32 位种子；掉落与强化也纳入统一 RNG 序列以复现

---

## 7. 怪物与对抗参数（改写为境界制）

### 7.1 数据字段

```
id, name, realm_stage, rank, hpMax, atk, def, rewardGold, isBoss?, tough?
```

* `realm_stage`：用于查表 `DEF_ref(realm_stage)`
* `rank`：普通=0 / 精英=1 / BOSS=2（用于穿透公式）
* `tough`：普通 1.0，BOSS 1.5（可随地图/词缀调整）

### 7.2 参考防御与穿透

* `DEF_ref(realm_stage)` 按固定表/插值
* 敌方穿透：`PenPct = clamp(0.05 + 0.01*Realm + 0.03*rank, 0, 0.60)`；`PenFlat` 由个别词缀/技能赋予

---

## 8. 掉落与经济（最小必要改写）

### 8.1 掉落槽

* 普通怪：70% 无；25% 1 槽；5% 2 槽（期望 0.35）
* BOSS：保底 **2 槽**；另 30% +1，10% 再 +1（期望 ≈2.4）

### 8.2 槽内类型

* 普通怪：以**药水 / 装备 / 金币包**为主；不产宝石
* BOSS：每槽独立抽 **装备 55% / 宝石 25% / 金币包 20%**

  * 装备“**越阶概率**”30%（至少为当前段位）；**预强化**：BOSS 装备 2–5 级等概率（普通 0–2）

> 原“等级段通用池”改为按 **境界段** 配置（初学=一至三境、进阶=四至六、高阶=七至九、圣域）。各段产出的系列（Iron/Steel/Knight/Mithril/Rune/Dragon…）与解锁阈值在产线中统一维护；表格可复用原结构，仅将“LV段”改为“境界段”。

### 8.3 商店

* **消耗品**：无限量（见 §4.3）
* **装备**：仅售入门系列（Iron/Steel）
* **宝石**：祝福宝石开局可买；灵魂宝石在击败**高阶（≥七级）BOSS**后解锁；奇迹宝石在**圣域 BOSS**后解锁

---

## 9. 地图系统（保持）

* 地图页为默认落点：左侧列表 / 右侧根据地图类型切换布局
* 城市地图：地点标记按钮（百分比坐标）
* 野外地图：人物状态 + 底图 + 怪物标记；点击即战斗，结算后返回
* 锁定：首个城市与首个野外默认解锁；其余野外需对应 **BOSS 首杀** 解锁
* 路由刷新回到最近一次的可用地图

---

## 10. UI 与可视化（新增/更新）

* **境界条**：显示当前段与小境界进度；满值高亮“瓶颈”，弹出可选突破途径与成功率修正
* **斗气环**：显示 `Qi/QiMax`、运转/预热 `F(t)`、低蓝警示（<5%）
* **面板区**：

  * 身体属性（HP/QiMax/ATK/DEF/AGI/REC）
  * 斗气加成（运转有效值与理论值对照：`F(t)*Qi_ATK/DEF/AGI`）
* **成长提示**：突破率弹出 “+” 提示
* **战斗时间线**：
  * 位置：战斗界面底部技能条上方，横向占满；战斗开始即启用；退出战斗（§6.2）时重置
  * 刻度：默认 6.0s 视图（12 格，每格 0.5s）；时间向右滚动，当前帧用竖线标记；暂停逻辑沿用调试工具
  * 轨道：双轨展示——上轨绑定玩家 4 槽与基础互动，下轨绑定敌方动作与环境事件（如陷阱、地图技）
  * 玩家轨：按技能槽顺序堆叠色块，块长 = 动作前摇+施放时间；冷却阶段以浅色描边延伸至下一次可施放节点；自动施法模式下补入重复排程
  * 敌方轨：按实体列出；怪物普攻节奏（默认 1.6s）预先排入；读条技与 Boss 技能以加粗描边强调；提供 0.4s “完美闪避窗”半透明覆盖
  * 资源反馈：当 `Qi < cost` 或预热 `F(t)` 未达阈值时，同步点亮黄色警示；触发斗气防御时在对应时间段插入 90% 吸收条
  * 交互：鼠标悬停显示 tooltip（技能名/伤害/消耗/预计命中时间）；点击玩家块可快速切换到该技能槽；键盘/手柄不增设额外操作

---

## 11. 调参起点（统一抄数）

* **BP→单位**：`K_bp2unit = 10`
* **修炼**：仅怪物击杀获得 BP；其余行为不产出 BP
* **突破**：强突 `P0=0.08-0.04p`（≤35%）；导师 ×1.15
* **运转**：预热 30s；退出阈值 5% QiMax；成本 1/3/7/12% QiMax；闪避 6%（成功返 4%）
* **恢复**：`Qi/sec=(1+0.06*REC)*state_mult*F_mult`；紫焰×`(1+0.2F)`、`REC+20`；HP 自然恢复 `0.1*REC`（战中×0.5、Boss×0.25）
* **防御**：斗气防御固定 90%×F(t)，单击上限 60%，Qi 代价=吸收×1.1
* **对抗**：`PenPct = clamp(0.05 + 0.01*Realm + 0.03*rank, 0, 0.60)`；`PenFlat` 由技能/装备提供
* **减伤曲线**：平衡点 f=0.5，`K=DEF_ref(realm_stage)`；tough：玩家1.0/怪1.0/BOSS1.5（0.5~2.0 浮动）

---

## 游戏数据库

### 装备列表
| 槽位 | id | 英文名称 | 等级需求 | 主属性 | 副属性 | 价格(GOLD) |
|------|---|---|---:|---|---|---:|
| 右手武器 | iron-sword | 铁剑 | 1 | ATK 25 | +3 ATK | 300 |
| 双手武器 | iron-maul | 铁锤 | 1 | ATK 45 | +4 ATK | 500 |
| 左手盾 | iron-shield | 铁盾 | 1 | DEF 10 | +2 DEF | 250 |
| 铠甲 | iron-plate | 铁甲 | 1 | DEF 15 | +2 DEF, +20 HP | 400 |
| 头盔 | iron-helm | 铁盔 | 1 | DEF 8 | +1 DEF | 200 |
| 手套 | iron-gloves | 铁手套 | 1 | DEF 5 | +1 DEF | 150 |
| 腰带 | leather-belt | 皮带 | 1 | DEF 6 | +1 DEF | 180 |
| 戒指 | iron-ring | 铁戒指 | 1 | HP 30 | +5 HP | 220 |
| 鞋子 | iron-boots | 铁靴 | 1 | DEF 7 | +1 DEF | 200 |
| 右手武器 | steel-blade | 钢刃 | 10 | ATK 40 | +3 ATK | 600 |
| 双手武器 | steel-greatsword | 巨型钢剑 | 10 | ATK 72 | +4 ATK | 1000 |
| 左手盾 | steel-bulwark | 钢盾 | 10 | DEF 16 | +2 DEF | 500 |
| 铠甲 | steel-cuirass | 钢甲 | 10 | DEF 24 | +2 DEF, +20 HP | 800 |
| 头盔 | steel-helm | 钢盔 | 10 | DEF 13 | +1 DEF | 400 |
| 手套 | steel-gauntlets | 钢护手 | 10 | DEF 8 | +1 DEF | 300 |
| 腰带 | studded-belt | 铆钉腰带 | 10 | DEF 10 | +1 DEF | 360 |
| 戒指 | amber-ring | 琥珀戒 | 10 | HP 48 | +5 HP | 440 |
| 鞋子 | steel-greaves | 钢靴 | 10 | DEF 11 | +1 DEF | 400 |
| 右手武器 | knight-blade | 骑士刃 | 20 | ATK 55 | +3 ATK | 1050 |
| 双手武器 | knight-warhammer | 骑士战锤 | 20 | ATK 99 | +4 ATK | 1750 |
| 左手盾 | knight-tower-shield | 骑士塔盾 | 20 | DEF 22 | +2 DEF | 875 |
| 铠甲 | knight-armor | 骑士甲 | 20 | DEF 33 | +2 DEF, +20 HP | 1400 |
| 头盔 | knight-helm | 骑士盔 | 20 | DEF 18 | +1 DEF | 700 |
| 手套 | knight-gauntlets | 骑士护手 | 20 | DEF 11 | +1 DEF | 525 |
| 腰带 | reinforced-belt | 加固腰带 | 20 | DEF 13 | +1 DEF | 630 |
| 戒指 | ruby-ring | 红玉戒 | 20 | HP 66 | +5 HP | 770 |
| 鞋子 | knight-sabatons | 骑士胫甲 | 20 | DEF 15 | +1 DEF | 700 |
| 右手武器 | mithril-saber | 秘银军刀 | 30 | ATK 78 | +3 ATK | 1800 |
| 双手武器 | mithril-claymore | 秘银巨剑 | 30 | ATK 140 | +4 ATK | 3000 |
| 左手盾 | mithril-aegis | 秘银盾 | 30 | DEF 31 | +2 DEF | 1500 |
| 铠甲 | mithril-hauberk | 秘银甲 | 30 | DEF 46 | +2 DEF, +20 HP | 2400 |
| 头盔 | mithril-coif | 秘银盔 | 30 | DEF 25 | +1 DEF | 1200 |
| 手套 | mithril-gloves | 秘银护手 | 30 | DEF 16 | +1 DEF | 900 |
| 腰带 | silverweave-belt | 银纹腰带 | 30 | DEF 19 | +1 DEF | 1080 |
| 戒指 | sapphire-ring | 蓝宝石戒 | 30 | HP 93 | +5 HP | 1320 |
| 鞋子 | mithril-boots | 秘银长靴 | 30 | DEF 22 | +1 DEF | 1200 |
| 右手武器 | runed-edge | 符文之锋 | 40 | ATK 105 | +3 ATK | 2700 |
| 双手武器 | runed-greataxe | 符文巨斧 | 40 | ATK 189 | +4 ATK | 4500 |
| 左手盾 | runed-bulwark | 符文壁垒 | 40 | DEF 42 | +2 DEF | 2250 |
| 铠甲 | runed-cuirass | 符文甲 | 40 | DEF 63 | +2 DEF, +20 HP | 3600 |
| 头盔 | runed-helm | 符文头盔 | 40 | DEF 34 | +1 DEF | 1800 |
| 手套 | runed-gauntlets | 符文护手 | 40 | DEF 21 | +1 DEF | 1350 |
| 腰带 | glyph-belt | 符纹腰带 | 40 | DEF 25 | +1 DEF | 1620 |
| 戒指 | topaz-ring | 黄玉戒 | 40 | HP 126 | +5 HP | 1980 |
| 鞋子 | runed-greaves | 符文胫甲 | 40 | DEF 29 | +1 DEF | 1800 |
| 右手武器 | dragonbone-fang | 龙骨之牙 | 50 | ATK 130 | +3 ATK | 3900 |
| 双手武器 | dragonslayer | 屠龙者 | 50 | ATK 234 | +4 ATK | 6500 |
| 左手盾 | dragonbone-shield | 龙骨盾 | 50 | DEF 52 | +2 DEF | 3250 |
| 铠甲 | dragonscale-armor | 龙鳞甲 | 50 | DEF 78 | +2 DEF, +20 HP | 5200 |
| 头盔 | dragonbone-helm | 龙骨盔 | 50 | DEF 42 | +1 DEF | 2600 |
| 手套 | dragonbone-gauntlets | 龙骨护手 | 50 | DEF 26 | +1 DEF | 1950 |
| 腰带 | dragonscribed-belt | 龙纹腰带 | 50 | DEF 31 | +1 DEF | 2340 |
| 戒指 | emerald-ring | 祖母绿戒 | 50 | HP 156 | +5 HP | 2860 |
| 鞋子 | dragonscale-boots | 龙鳞靴 | 50 | DEF 36 | +1 DEF | 2600 |
| 右手武器 | radiant-sword | 辟光剑 | 60 | ATK 160 | +3 ATK | 5400 |
| 双手武器 | starbreaker | 碎星者 | 60 | ATK 288 | +4 ATK | 9000 |
| 左手盾 | celestial-bulwark | 天穹壁垒 | 60 | DEF 64 | +2 DEF | 4500 |
| 铠甲 | starlit-plate | 星辉甲 | 60 | DEF 96 | +2 DEF, +20 HP | 7200 |
| 头盔 | starcrest | 星冕 | 60 | DEF 51 | +1 DEF | 3600 |
| 手套 | starlit-gauntlets | 星辉护手 | 60 | DEF 32 | +1 DEF | 2700 |
| 腰带 | starwoven-belt | 星纹腰带 | 60 | DEF 38 | +1 DEF | 3240 |
| 戒指 | morningstar-ring | 晨星戒 | 60 | HP 192 | +5 HP | 3960 |
| 鞋子 | starlit-boots | 星辉长靴 | 60 | DEF 45 | +1 DEF | 3600 |

### 怪物详细数据

| ID | 名称 | LV | HP | ATK | DEF | EXP | GOLD | BOSS | 所属地图 |
|---|---|---:|---:|---:|---:|---:|---:|:---:|---|
| `slime` | 史莱姆 (Slime) | 1 | 80 | 12 | 2 | 30 | 25 |  | 青苔原 (fringe) |
| `wolf` | 野狼 (Wolf) | 4 | 130 | 20 | 6 | 45 | 35 |  | 青苔原 (fringe) |
| `goblin` | 哥布林 (Goblin) | 6 | 180 | 24 | 10 | 65 | 55 |  | 青苔原 (fringe) |
| `boar` | 巨型野猪 (Boar) | 8 | 260 | 31 | 13 | 90 | 70 |  | 青苔原 (fringe) |
| `boss-golden-sheep` | 黄金绵羊 (Golden Sheep) | 10 | 1000 | 45 | 28 | 400 | 300 | ✔ | 青苔原 (fringe) |
| `ice-boli` | 冰玻力 (Ice Boli) | 12 | 460 | 55 | 24 | 160 | 140 |  | 熔冰之脊 (spine-of-frostfire) |
| `pyro-fox` | 火焰狐 (Pyro Fox) | 14 | 520 | 62 | 20 | 190 | 165 |  | 熔冰之脊 (spine-of-frostfire) |
| `froststone-colossus` | 寒岩巨像 (Stone Golem) | 17 | 780 | 70 | 35 | 240 | 210 |  | 熔冰之脊 (spine-of-frostfire) |
| `boss-wind-raptor` | 风暴迅猛龙 (Wind Raptor) | 20 | 1600 | 135 | 46 | 540 | 600 | ✔ | 熔冰之脊 (spine-of-frostfire) |
| `shade` | 影子刺客 (Shade) | 22 | 980 | 95 | 38 | 360 | 330 |  | 雷隐堡垒 (thunderveil-keep) |
| `thunder-knight` | 雷霆骑士 (Thunder Knight) | 25 | 1200 | 112 | 43 | 480 | 420 |  | 雷隐堡垒 (thunderveil-keep) |
| `abyss-witch` | 深渊女巫 (Abyss Witch) | 28 | 1350 | 128 | 46 | 540 | 500 |  | 雷隐堡垒 (thunderveil-keep) |
| `boss-dragon-whelp` | 幼龙 (Dragon Whelp) | 30 | 2200 | 170 | 72 | 660 | 610 | ✔ | 雷隐堡垒 (thunderveil-keep) |
| `m-specter` | 沼泽魅影 (Marsh Specter) | 31 | 1622 | 139 | 49 | 441 | 378 |  | 腐沼根海 (bogroot-expanse) |
| `m-rockback` | 岩背巨兽 (Marsh Rockback) | 32 | 1682 | 143 | 50 | 456 | 391 |  | 腐沼根海 (bogroot-expanse) |
| `m-raven` | 血鸦 (Marsh Blood Raven) | 34 | 1785 | 151 | 53 | 483 | 415 |  | 腐沼根海 (bogroot-expanse) |
| `boss-treant` | 腐沼树妖 (Bog Treant) | 35 | 2676 | 182 | 65 | 622 | 535 | ✔ | 腐沼根海 (bogroot-expanse) |
| `m-nightstalker` | 夜巡狼人 (Nightstalker) | 36 | 1906 | 159 | 55 | 513 | 441 |  | 暮影裂谷 (duskfang-rift) |
| `m-troll` | 寒霜巨魔 (Frost Troll) | 37 | 1967 | 163 | 57 | 529 | 454 |  | 暮影裂谷 (duskfang-rift) |
| `m-hound` | 熔岩猎犬 (Lava Hound) | 39 | 2070 | 171 | 59 | 556 | 477 |  | 暮影裂谷 (duskfang-rift) |
| `boss-priest` | 暗影祭司 (Shadow Priest) | 40 | 3088 | 206 | 74 | 713 | 612 | ✔ | 暮影裂谷 (duskfang-rift) |
| `m-harvester` | 骨响收割者 (Bone Harvester) | 41 | 2190 | 179 | 62 | 586 | 503 |  | 暗辉法枢 (gloomlit-arcanum) |
| `m-sentinel` | 符文哨兵 (Rune Sentinel) | 42 | 2233 | 183 | 63 | 598 | 513 |  | 暗辉法枢 (gloomlit-arcanum) |
| `m-reaver` | 虚空撕裂者 (Void Reaver) | 44 | 2354 | 191 | 66 | 628 | 540 |  | 暗辉法枢 (gloomlit-arcanum) |
| `boss-archmage` | 堕落大法师 (Fallen Archmage) | 45 | 3500 | 230 | 81 | 803 | 690 | ✔ | 暗辉法枢 (gloomlit-arcanum) |
| `m-stormcaller` | 风暴召唤者 (Stormcaller) | 46 | 2457 | 199 | 68 | 655 | 563 |  | 黑曜风痕 (obsidian-windscar) |
| `m-colossus` | 黑曜巨像 (Obsidian Colossus) | 47 | 2517 | 203 | 70 | 670 | 576 |  | 黑曜风痕 (obsidian-windscar) |
| `m-titan` | 焰生泰坦 (Flameborn Titan) | 49 | 2638 | 211 | 72 | 700 | 602 |  | 黑曜风痕 (obsidian-windscar) |
| `boss-knight` | 恐惧骑士 (Dread Knight) | 50 | 3887 | 253 | 90 | 891 | 765 | ✔ | 黑曜风痕 (obsidian-windscar) |
| `m-chimera` | 秘能奇美拉 (Arcane Chimera) | 51 | 2741 | 219 | 75 | 727 | 625 |  | 霜焰裂潮 (frostfire-maelstrom) |
| `m-wyrm` | 冰霜飞龙 (Frost Wyrm) | 52 | 2801 | 223 | 76 | 742 | 638 |  | 霜焰裂潮 (frostfire-maelstrom) |
| `m-kraken` | 深海巨妖 (Abyss Kraken) | 54 | 2922 | 231 | 79 | 773 | 664 |  | 霜焰裂潮 (frostfire-maelstrom) |
| `boss-warlord` | 地狱军阀 (Infernal Warlord) | 55 | 4299 | 277 | 97 | 981 | 842 | ✔ | 霜焰裂潮 (frostfire-maelstrom) |
| `m-templar` | 天穹圣卫 (Celestial Templar) | 56 | 3025 | 239 | 81 | 800 | 687 |  | 星界王座 (astral-crown) |
| `m-banshee` | 灰烬魅灵 (Ashen Banshee) | 57 | 3086 | 243 | 82 | 815 | 700 |  | 星界王座 (astral-crown) |
| `m-hunter` | 苍穹狩魔者 (Skyscour Hunter) | 59 | 3207 | 251 | 85 | 845 | 727 |  | 星界王座 (astral-crown) |
| `boss-dragon` | 远古龙王 (Ancient Dragon) | 60 | 4600 | 300 | 104 | 1075 | 923 | ✔ | 星界王座 (astral-crown) |
| `m-faerie`             | 森灵妖精 (Forest Faerie)   | 61 | 3150 | 258 |  86 |  860 |  735 |      | 绿野仙境 (green-elysium) |
| `m-bloomfiend`         | 绽灵花魔 (Bloomfiend)      | 62 | 3220 | 265 |  88 |  882 |  750 |      | 绿野仙境 (green-elysium) |
| `m-dreamstag`          | 梦角鹿 (Dream Stag)       | 63 | 3305 | 272 |  90 |  905 |  768 |      | 绿野仙境 (green-elysium) |
| `m-sylvan-sentinel`    | 森域守卫 (Sylvan Sentinel) | 64 | 3400 | 280 |  92 |  930 |  785 |      | 绿野仙境 (green-elysium) |
| `boss-queen-of-blooms` | 绽辉女王 (Queen of Blooms) | 65 | 4950 | 325 | 108 | 1150 |  970 |   ✔  | 绿野仙境 (green-elysium) |

### 地图列表

| 地图 ID | 名称 | 地图类型 | 解锁条件 |
|---|---|---|---|
| `florence` | 翡冷翠 | 城市 | 默认解锁 |
| `fringe` | 青苔原 | 野外 | 默认解锁 |
| `spine-of-frostfire` | 熔冰之脊 | 野外 | 击败黄金绵羊 |
| `thunderveil-keep` | 雷隐堡垒 | 野外 | 击败风暴迅猛龙 |
| `bogroot-expanse` | 腐沼根海 | 野外 | 击败幼龙 |
| `duskfang-rift` | 暮影裂谷 | 野外 | 击败腐沼树妖 |
| `gloomlit-arcanum` | 暗辉法枢 | 野外 | 击败暗影祭司 |
| `obsidian-windscar` | 黑曜风痕 | 野外 | 击败堕落大法师 |
| `frostfire-maelstrom` | 霜焰裂潮 | 野外 | 击败恐惧骑士 |
| `astral-crown` | 星界王座 | 野外 | 击败地狱军阀 |
| `green-elysium` | 绿野仙境 | 野外 | 击败远古龙王 |
