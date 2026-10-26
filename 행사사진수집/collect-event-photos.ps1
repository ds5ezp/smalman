# 행사 사진 자동 수집 (복지관 사무실 PC에서 실행)
# 1) 게시판 RSS를 읽어 행사 글 목록과 본문 속 사진 주소를 찾고
# 2) 사진을 '행사 사진' 폴더 안에 '날짜_제목' 폴더로 내려받음
# 3) 그 폴더를 구글 드라이브 데스크톱이 자동으로 올림
# 이미 받은 사진은 건너뛰므로 여러 번 실행해도 괜찮음

param(
  # 구글 드라이브 데스크톱 동기화 폴더 (PC마다 다를 수 있으니 확인해서 고치세요)
  [string]$DestRoot = 'G:\내 드라이브\행사 사진',
  # 최근 행사 글 몇 개까지 볼지
  [int]$MaxItems = 10
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$logFile = Join-Path $PSScriptRoot 'collect.log'

function Write-Log($msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Output $line
}

# 폴더 이름에 쓸 수 없는 글자 제거
function Get-SafeName($text) {
  $safe = ($text -replace '[\\/:*?"<>|]', '').Trim()
  if ($safe.Length -gt 60) { $safe = $safe.Substring(0, 60).Trim() }
  return $safe
}

try {
  if (-not (Test-Path $DestRoot)) {
    throw "행사 사진 폴더를 찾을 수 없습니다: $DestRoot (구글 드라이브 데스크톱이 실행 중인지 확인하세요)"
  }

  $rssUrl = 'http://gjcw.or.kr/wp-content/plugins/kboard/rss.php?board_id=6'
  $rss = [xml](Invoke-WebRequest -Uri $rssUrl -UseBasicParsing).Content
  $items = @($rss.rss.channel.item | Select-Object -First $MaxItems)
  Write-Log ("RSS 글 {0}개 확인" -f $items.Count)

  foreach ($item in $items) {
    $title = $item.title.InnerText
    $date = [datetime]::Parse([string]$item.pubDate).ToString('yyyy-MM-dd')
    $folderName = Get-SafeName ("{0}_{1}" -f $date, $title)
    $folder = Join-Path $DestRoot $folderName

    # 본문 속 사진 주소 (복지관 업로드 경로의 jpg, png, gif, webp만)
    $html = $item.description.InnerText
    $urls = @()
    foreach ($m in [regex]::Matches($html, '<img[^>]+src=["'']([^"'']+)["'']', 'IgnoreCase')) {
      $u = $m.Groups[1].Value
      if ($u -match '/wp-content/uploads/' -and $u -match '\.(jpe?g|png|gif|webp)$' -and $urls -notcontains $u) {
        $urls += $u
      }
    }
    Write-Log ("[{0}] 사진 주소 {1}개 찾음" -f $folderName, $urls.Count)
    if ($urls.Count -eq 0) { continue }

    if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }

    $n = 0
    foreach ($u in $urls) {
      $n++
      $ext = [System.IO.Path]::GetExtension(($u -replace '\?.*$', '')).ToLower()
      $file = Join-Path $folder ('{0:D2}{1}' -f $n, $ext)
      if (Test-Path $file) { continue }   # 이미 받은 사진은 건너뜀
      try {
        Invoke-WebRequest -Uri $u -OutFile $file -UseBasicParsing
        Write-Log ("저장: {0}" -f $file)
      } catch {
        Write-Log ("사진 받기 실패: {0} ({1})" -f $u, $_.Exception.Message)
      }
    }
  }
  Write-Log '완료'
} catch {
  Write-Log ("오류: {0}" -f $_.Exception.Message)
  exit 1
}
