# 행사 사진 자동 수집 (복지관 사무실 PC에서 실행)
# 1) 게시판 RSS를 읽어 행사 글 목록과 본문 속 사진 주소를 찾고
# 2) 사진을 '행사 사진' 폴더 안에 '날짜_제목' 폴더로 내려받음
# 3) 그 폴더를 구글 드라이브 데스크톱이 자동으로 올림
# 이미 받은 사진은 건너뛰므로 여러 번 실행해도 괜찮음

param(
  # 구글 드라이브 데스크톱 동기화 폴더 (PC마다 다를 수 있으니 확인해서 고치세요)
  [string]$DestRoot = 'G:\내 드라이브\행사 사진',
  # 확인할 행사 글 개수 (RSS가 내보내는 만큼 확인)
  [int]$MaxItems = 50
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$logFile = Join-Path $PSScriptRoot 'collect.log'

function Write-Log($msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  Write-Output $line
}

# 폴더 이름에 쓸 수 없는 글자 제거
function Get-SafeName($text) {
  $safe = ($text -replace '[\\/:*?"<>|]', '').Trim()
  if ($safe.Length -gt 60) { $safe = $safe.Substring(0, 60).Trim() }
  return $safe
}

# 줄여진 사진 주소(예: 이름-1030x773.jpg)를 원본 주소(이름.jpg)로 바꿈
function Get-OriginalUrl($u) {
  return ($u -replace '-\d+x\d+(\.[A-Za-z]+)$', '$1')
}

# 사진을 내려받아 파일로 저장. 원본 주소를 먼저 시도하고, 안 되면 본문 주소로 다시 시도
function Save-Photo($url, $file) {
  $candidates = @((Get-OriginalUrl $url), $url) | Select-Object -Unique
  $lastError = ''
  foreach ($c in $candidates) {
    try {
      $resp = Invoke-WebRequest -Uri $c -UseBasicParsing
      [System.IO.File]::WriteAllBytes($file, $resp.RawContentStream.ToArray())
      return $c
    } catch {
      $lastError = $_.Exception.Message
    }
  }
  throw $lastError
}

try {
  if (-not [System.IO.Directory]::Exists($DestRoot)) {
    throw "행사 사진 폴더를 찾을 수 없습니다: $DestRoot (구글 드라이브 데스크톱이 실행 중인지 확인하세요)"
  }

  $rssUrl = 'http://gjcw.or.kr/wp-content/plugins/kboard/rss.php?board_id=6'
  # RSS는 UTF-8로 읽어야 한글 제목이 깨지지 않음 (인코딩 표시가 없어서 명시적으로 지정)
  $rawBytes = (Invoke-WebRequest -Uri $rssUrl -UseBasicParsing).RawContentStream.ToArray()
  $rssText = [Text.Encoding]::UTF8.GetString($rawBytes)
  $rss = [xml]$rssText
  $items = @($rss.rss.channel.item | Select-Object -First $MaxItems)
  Write-Log ("RSS 글 {0}개 확인" -f $items.Count)

  foreach ($item in $items) {
    # 글 하나가 실패해도 나머지 글은 계속 처리
    try {
      $title = $item.title.InnerText
      $date = [datetime]::Parse([string]$item.pubDate).ToString('yyyy-MM-dd')
      $folderName = Get-SafeName ("{0}_{1}" -f $date, $title)
      $folder = [System.IO.Path]::Combine($DestRoot, $folderName)

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

      [System.IO.Directory]::CreateDirectory($folder) | Out-Null

      $n = 0
      foreach ($u in $urls) {
        $n++
        $ext = [System.IO.Path]::GetExtension(($u -replace '\?.*$', '')).ToLower()
        $file = [System.IO.Path]::Combine($folder, ('{0:D2}{1}' -f $n, $ext))
        if ([System.IO.File]::Exists($file)) { continue }   # 이미 받은 사진은 건너뜀
        try {
          $used = Save-Photo $u $file
          Write-Log ("저장: {0} ({1})" -f $file, $used)
        } catch {
          Write-Log ("사진 받기 실패: {0} ({1})" -f $u, $_.Exception.Message)
        }
      }
    } catch {
      Write-Log ("글 처리 실패: {0}" -f $_.Exception.Message)
    }
  }
  Write-Log '완료'
} catch {
  Write-Log ("오류: {0}" -f $_.Exception.Message)
  exit 1
}
