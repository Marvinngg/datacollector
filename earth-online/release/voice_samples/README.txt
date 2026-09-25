《地球 Online》旁白试听样本（男声候选）
内容：L04–L06 连读 + L14–L16 连读，句间停顿同片中（0.7 / 1.0 秒；两组之间 1.6 秒）。
五个样本已统一响度（语音 RMS -20 dBFS），mp3 128k 单声道。每句最多合成 4 次，取 ASR 拼音比对最好的一次。
"拼音错误"：SenseVoice 转写与原文按带调拼音比对的差异数，同音字不计；括号里是 24 句全文测试的结果。

A_zipvoice_emilia_prompt.mp3    【首选推荐】
  引擎：ZipVoice-distill（int8，Emilia 真人中文语料训练，零样本）
  参考音频：ZipVoice 发布包自带的示例 prompt.wav（匿名男声，"周日被我射熄火了，所以今天是周一。"）
  F0 约 116Hz，起伏 9 半音，3.5 字/秒；拼音错误 0（24 句全文 1 处，重试后 0）
  全片按此语速约 128–131 秒

B_zipvoice_ref_aishell3_sid110.mp3
  引擎：ZipVoice-distill；参考音频为 AISHELL-3 VITS 合成的男声（sid 110），不是真人录音
  F0 约 142Hz（略偏高），起伏 8 半音，4.2 字/秒；拼音错误 0（24 句全文 0）
  全片约 118 秒

C_zipvoice_ref_aishell3_sid124.mp3
  引擎：ZipVoice-distill；参考音频为 AISHELL-3 VITS 合成的低沉男声（sid 124）
  F0 约 106Hz（最低沉），起伏 6 半音（偏平），4.0 字/秒；拼音错误 0（24 句全文 2，重试可消除）
  全片约 121 秒

D_kokoro_v1_0_zm_yunjian_sid49.mp3   （对照）
  引擎：Kokoro v1.0 中文男声 zm_yunjian（与之前被否的 v1.1 同架构，可能有同样的"外国口音"问题）
  F0 约 117Hz，起伏 8 半音，4.0 字/秒；拼音错误 0（24 句全文 4）

E_vits_aishell3_sid98.mp3            （对照，不推荐）
  引擎：VITS AISHELL-3 直接合成（sid 98），模型只有 8kHz 采样率，音质发闷、有含混
  F0 约 125Hz，起伏 6 半音，4.0 字/秒；拼音错误 2（24 句全文 30）

已排除：vits-melo-tts-zh_en（只有女声）、matcha-icefall-zh-en（单一女声，F0 约 247Hz）、matcha-zh-baker（女声）、
vits-icefall-zh-aishell3（比 vits-zh-aishell3 更差，24 句 CER 19–45%）。
