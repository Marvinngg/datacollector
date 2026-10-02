# 用阿里开源 CosyVoice 给《李叔的冬瓜》配音（在你自己的电脑上）

做完以后，24 句台词会变成 `winter-melon/assets/voice_override/` 下的 24 个 wav 文件。推到仓库后，出片流程会自动用它们替换现在的合成配音。

- **用什么配**：每个角色用一段合成的参考音色，在 `assets/voice_refs/cast/` 里，不克隆任何真人。每句台词怎么说，写在脚本里每句的 `how` 字段，例如"用七十多岁老汉低沉的声音，冷淡、干脆地说"，CosyVoice 会照着说。
- **需要准备**：Python 3.10（建议装 Miniconda）、git，以及大约 10GB 空闲磁盘。有 NVIDIA 显卡会很快；没有也能跑，CPU 上 24 句大约要 10–30 分钟，Mac 也可以。

---

## 第 1 步：拿到我们的项目（只下载 winter-melon 文件夹）

```bash
git clone --filter=blob:none --no-checkout -b claude/vm-environment-new-branch-av6bg5 https://github.com/Marvinngg/datacollector.git
cd datacollector
git sparse-checkout set --no-cone '/winter-melon/' '!/winter-melon/release/'
git checkout
cd ..
```

## 第 2 步：安装 CosyVoice

```bash
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
git submodule update --init --recursive          # 如果第一条命令没把子模块拉全，这一条会补上
conda create -n cosyvoice -y python=3.10
conda activate cosyvoice
pip install -r requirements.txt
pip install soundfile
```

- **在国内网络**：可以在 pip 命令后面加 `-i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com`，用阿里云的镜像会快很多。
- **Mac，或者没有 NVIDIA 显卡**：`requirements.txt` 里有几个包只能在 Linux 加 NVIDIA 显卡的环境下装，比如名字带 `gpu`、`tensorrt`、`deepspeed` 的。哪一行装不上，就在 `requirements.txt` 里删掉那一行，再执行一次 `pip install -r requirements.txt`。如果最后缺 `onnxruntime`，再单独装一下：`pip install onnxruntime`。

## 第 3 步：下载模型（约 2GB）

继续在 `CosyVoice` 目录里执行，下面两种方式任选一种：

```bash
# ModelScope（国内网络推荐）
python -c "from modelscope import snapshot_download; snapshot_download('iic/CosyVoice2-0.5B', local_dir='pretrained_models/CosyVoice2-0.5B')"

# Hugging Face（海外网络）
pip install -U huggingface_hub
huggingface-cli download FunAudioLLM/CosyVoice2-0.5B --local-dir pretrained_models/CosyVoice2-0.5B
```

## 第 4 步：先试两场，听听效果

继续在 `CosyVoice` 目录里执行：

```bash
python ../datacollector/winter-melon/tools/cosyvoice_local.py --model pretrained_models/CosyVoice2-0.5B --only s05,s08
```

- **生成的文件**：在 `datacollector/winter-melon/assets/voice_override/` 下，比如 `s05_2.wav` 是李叔说"不卖。"。
  - s05 这场是李叔拒绝卖瓜，包括"我还没老到要人可怜"。
  - s08 这场是他看留言，包括"……她真说好喝？"。
- **满意的话**：去掉 `--only`，把全部 24 句都配出来。
- **想多几个版本挑**：加 `--takes 3`，会额外生成 `.take2.wav`、`.take3.wav`。挑中哪个，就把它改名成不带 take 的文件名。

## 第 5 步：不满意怎么调

| 问题 | 怎么改 |
|---|---|
| 语气不对 | 打开 `winter-melon/script/film.json`，找到那句台词，改它的 `how`，比如"更慢一点、声音更哑、带点笑意"，然后用 `--only 场景号` 重跑 |
| 李叔不够老 | 在他每句的 `how` 里都写上"七十多岁、声音沙哑、说话慢"；也可以换一个更低沉的参考音色，替换 `assets/voice_refs/cast/qin.wav`，必须是合成声，不要用真人录音，内容是"其实这件事也没那么复杂，你先别着急，我们慢慢来。" |
| 语速太快或太慢 | 改 `tools/cosyvoice_local.py` 开头的 `SPEED`，数字越小越慢 |
| 读错字 | 把台词里那个字换成读音正确的同音字 |
| 完全不要语气指令 | 加 `--no-instruct`，只按参考音色朗读 |

## 改了台词以后：只补配改过的句子

`assets/voice_override/texts.json` 记着每个文件是按哪句台词配的。脚本里的台词改过以后，旧文件不会再被用上，出片时这几句先用云端的合成声顶着。只补配新加的和改过的句子：

```bash
python ../datacollector/winter-melon/tools/cosyvoice_local.py --model pretrained_models/CosyVoice2-0.5B --no-instruct --stale
```

配完照第 6 步推上来，`texts.json` 也要一起提交（它在 `voice_override` 文件夹里，`git add` 那个文件夹就会带上）。

## 第 6 步：交给我出片

```bash
cd ../datacollector
git add winter-melon/assets/voice_override winter-melon/script/film.json
git commit -m "winter-melon: CosyVoice 配音"
git push
```

推不上去，一般是因为没有仓库的写权限。这时把 `winter-melon/assets/voice_override` 整个文件夹打包发给我就行。

告诉我"配音好了"，我这边会：
- 按新配音的长度重新排时间轴。
- 在说话处压低配乐和环境声。
- 重新出片。

---

### 其他两种做法（不用在本地装环境）

- **云端直接跑开源模型**：在当前会话标题栏打开云端环境菜单，点"编辑"，在"网络访问"里放行 `huggingface.co`、`cdn-lfs.huggingface.co`、`cas-bridge.xethub.hf.co`、`github.com`。如果改完还连不上，就新开一个会话。之后整个流程由我在云端全自动完成。
- **阿里云百炼的 CosyVoice 接口**：在阿里云百炼上申请 API key，加到云端环境的"密钥"里，不要贴在聊天里；再在网络设置里放行 `dashscope.aliyuncs.com`。这种最快，几十秒就能配完。
