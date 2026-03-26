const { exec } = require('child_process')
const { shell, ipcRenderer } = require('electron')
const fs = require('original-fs').promises
const path = require('path')

document.getElementsByTagName('a')[0].onclick = () => shell.openExternal('https://github.com/latt-tech/CefDetectorX')

let cnt = 0
let totalSize = 0
const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
const execAsync = cmd => new Promise(resolve => exec(cmd, { maxBuffer: 1000 * 1000 * 10, windowsHide: true }, (err, stdout, stderr) => {
  if (err || stderr) console.error(err || stderr)
  resolve(stdout || '')
}))
const exists = file => fs.stat(file).then(it => it.isFile(), () => false)
const dirSize = async (dir, cache = { }, deep = 0) => {
  if (deep > 10) return
  try {
    const stats = await fs.stat(dir)
    if (cache[stats.ino]) return
    cache[stats.ino] = true
    totalSize += stats.size
    if (stats.isDirectory()) {
      await Promise.all((await fs.readdir(dir)).map(it => dirSize(path.join(dir, it), cache, deep + 1)))
    }
  } catch { }
}



ipcRenderer
  .invoke('has-args', 'no-bgm')
  .then(async val => {
    if (val) return
    if (await exists(path.join(__dirname, 'bgm.mp3'))) {
      const audio = new Audio('bgm.mp3')
      audio.autoplay = true
      audio.loop = true
      audio.controls = true
      document.body.appendChild(audio)
    } else {
      const iframe = document.createElement('iframe')
      iframe.src = 'https://music.163.com/outchain/player?type=2&id=5264829&auto=1&height=32'
      iframe.frameBorder = 0
      iframe.border = 0
      iframe.marginwidth = 0
      iframe.marginheight = 0
      iframe.width = 280
      iframe.height = 52
      document.body.appendChild(iframe)
    }
  })

const prettySize = len => {
  let order = 0
  while (len >= 1024 && order < sizes.length - 1) {
    order++
    len /= 1024
  }
  return len.toFixed(2) + ' ' + sizes[order]
}

const cache = { }
const nodes = []
const mainElm = document.getElementsByTagName('main')[0]
const titleElm = document.getElementsByTagName('h2')[0]
const addApp = async (file, type, isDir = false) => {
  console.log('Found:', type, file)
  if (cache[file]) return
  const prevSize = totalSize
  await dirSize(isDir ? file : path.dirname(file))
  cache[file] = true
  const elm = document.createElement('section')
  const fileName = path.basename(file)
  elm.title = file
  nodes.push([totalSize - prevSize, elm])
  const icon = await ipcRenderer.invoke('get-app-icon', file)
  elm.innerHTML = (icon ? `<img src="data:image/png;base64,${icon}" alt="${fileName}">` : '<h3>?</h3>') +
    `<h6 class=${!isDir && processes[file] ? 'running' : ''}>${fileName}</h6><p>${type}</p><sub>${prettySize(totalSize - prevSize)}</sub>`
  elm.onclick = () => isDir ? shell.openPath(file) : shell.showItemInFolder(file)
  mainElm.appendChild(elm)

  titleElm.innerText = `这台电脑上总共有 ${++cnt} 个 Unity 实例 (${prettySize(totalSize)})`
}

const processes = { }
try {
  (await execAsync('wmic process get ExecutablePath')).replace(/\r/g, '').replace(/ +\n/g, '\n').split('\n').forEach(it => (processes[it] = 1))
} catch (e) {
  console.error(e)
}

const search = async (file) => {
  console.log('Searching:', file)
  try {
    let firstExe
    for (const it of (await fs.readdir(file)).filter(it => it.endsWith('.exe'))) {
      const fileName = path.join(file, it)
      const fileNameLowerCase = it.toLowerCase()
      if (!firstExe && !fileNameLowerCase.includes('unins') && !fileNameLowerCase.includes('setup') && !fileNameLowerCase.includes('report') && !fileNameLowerCase.includes('unitycrashhandler')) {
        firstExe = fileName
      }
    }
    return [false, firstExe]
  } catch (e) {
    console.error(e)
    return [false]
  }
}

const cache2 = { }
const searchUnity = async (stdout, defaultType = 'Unity') => {
  for (const file of stdout.replace(/\r/g, '').split('\n')) {
    if (file.includes('$RECYCLE.BIN') || file.includes('OneDrive') || /\.log$/i.test(file)) continue
    const dir = path.dirname(file)
    if (cache2[dir]) continue
    cache2[dir] = true
    if (await fs.stat(file).then(it => it.isDirectory(), () => true)) continue
    let res = await search(dir)
    if (res[1]) await addApp(res[1], defaultType)
    else await addApp(dir, defaultType, true)
  }
}

// 搜索 UnityPlayer.dll 文件
await searchUnity(await execAsync('es.exe -s UnityPlayer.dll'), 'Unity')

if (nodes.length) nodes.sort(([a], [b]) => b - a).forEach(([_, elm], i) => (elm.style.order = i.toString()))
else titleElm.innerText = '这台电脑上没有 Unity 实例 (也有可能是你没装 Everything)'
titleElm.className = 'running'
