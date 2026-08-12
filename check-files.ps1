# ============================================================================
# FlagRisk, what have I actually installed?
# Compares every file in the project against the version Claude produced.
# MATCH   the project has the current version
# STALE   the project has an older or edited version
# MISSING the file is not in the project at all
# PENDING a newer copy is still sitting in Downloads
# ============================================================================
$root = "C:\Users\HP\Desktop\flagrisk\app"
$dl   = "$HOME\Downloads"

$manifest = @(
  @{n="ChangePasswordScreen.tsx"; d="src/screens"; b=6892; h="377544ebe4eaf515"},
  @{n="CheckInInboxScreen.tsx"; d="src/screens"; b=13858; h="951445b4438d3beb"},
  @{n="CheckoutScreen.tsx"; d="src/screens"; b=9793; h="baf6d1417457448b"},
  @{n="CreateAccountScreen.tsx"; d="src/screens"; b=7208; h="f84469db5e6e5ee5"},
  @{n="Cta.tsx"; d="src/components"; b=3342; h="ed8999a11a354f35"},
  @{n="DashboardScreen.tsx"; d="src/screens"; b=23818; h="caa954bad01c7947"},
  @{n="DraggableSheet.tsx"; d="src/components"; b=2503; h="8332f22b98b10783"},
  @{n="EditProfileScreen.tsx"; d="src/screens"; b=8499; h="3e653f2e96f09ba2"},
  @{n="Feedback.tsx"; d="src/components"; b=7972; h="2fde20fbfd261d7e"},
  @{n="FloatingTabBar.tsx"; d="src/components"; b=3983; h="7fce8ebef92dd20d"},
  @{n="HelpArticleScreen.tsx"; d="src/screens"; b=2760; h="c631e389e4f79579"},
  @{n="HelpScreen.tsx"; d="src/screens"; b=6836; h="6e0fc10d0b2ff807"},
  @{n="IncidentDetailScreen.tsx"; d="src/screens"; b=25280; h="d1b6101bfe6bf968"},
  @{n="MapFlagScreen.tsx"; d="src/screens"; b=41215; h="7773e9b84255db4c"},
  @{n="NetworkFlagDetailScreen.tsx"; d="src/screens"; b=10221; h="2e202ade305ba0ec"},
  @{n="NetworkInvitesScreen.tsx"; d="src/screens"; b=7362; h="4319cf8bb1542057"},
  @{n="NetworkScreen.tsx"; d="src/screens"; b=16848; h="dd3d3437d09391ab"},
  @{n="NotificationsScreen.tsx"; d="src/screens"; b=17869; h="e8b0f69b54cf4f58"},
  @{n="OnboardingScreen.tsx"; d="src/screens"; b=6290; h="a10f041525329906"},
  @{n="PanicInboxScreen.tsx"; d="src/screens"; b=14356; h="71ba77087284e1f7"},
  @{n="PanicScreen.tsx"; d="src/screens"; b=14154; h="381f86c2e8cbd89f"},
  @{n="PaymentHistoryScreen.tsx"; d="src/screens"; b=6643; h="3d199ec5ac8b410c"},
  @{n="PaymentSuccessScreen.tsx"; d="src/screens"; b=3730; h="d91cd93ab0cdaf91"},
  @{n="PhonebookScreen.tsx"; d="src/screens"; b=10830; h="f0a5dec324756c4d"},
  @{n="PhotoCaptureScreen.tsx"; d="src/screens"; b=10153; h="aacb5b55ef595d80"},
  @{n="PlanPricingScreen.tsx"; d="src/screens"; b=14917; h="37452b53259052a1"},
  @{n="ProfileScreen.tsx"; d="src/screens"; b=18814; h="7bf9255c80c3a6cc"},
  @{n="ReportsScreen.tsx"; d="src/screens"; b=17339; h="2a4b07b8dd75d228"},
  @{n="RiskBreakdownScreen.tsx"; d="src/screens"; b=10457; h="a3c917756a59e154"},
  @{n="RiskGauge.tsx"; d="src/components"; b=3022; h="03fbc09e4d91c563"},
  @{n="SavedPlacesScreen.tsx"; d="src/screens"; b=8785; h="9645684ac93ea876"},
  @{n="SettingsScreen.tsx"; d="src/screens"; b=9099; h="390dcca7f853a619"},
  @{n="SignInScreen.tsx"; d="src/screens"; b=4033; h="8e6b5ae0ea8bd509"},
  @{n="SlideAction.tsx"; d="src/components"; b=4512; h="a50caa2d1a3fbba7"},
  @{n="SupportScreen.tsx"; d="src/screens"; b=10877; h="44c145bcd9771bd5"},
  @{n="SupportThreadScreen.tsx"; d="src/screens"; b=11957; h="d0f823efc8311e53"},
  @{n="TripWatchScreen.tsx"; d="src/screens"; b=29615; h="bd64cb76f68bebb5"},
  @{n="VideoCaptureScreen.tsx"; d="src/screens"; b=8676; h="7ef3fbf0b137a8f8"},
  @{n="authShared.tsx"; d="src/screens"; b=3006; h="724459b23cadb351"},
  @{n="riskIcons.ts"; d="src"; b=1124; h="a3092c60cb29b8c3"}
)

$results = foreach ($m in $manifest) {
  $path = Join-Path $root (Join-Path $m.d $m.n)
  $inDl = Test-Path (Join-Path $dl $m.n)

  if (-not (Test-Path $path)) {
    $state = "MISSING"; $bytes = 0
  } else {
    $bytes = (Get-Item $path).Length
    $hash  = (Get-FileHash $path -Algorithm SHA256).Hash.Substring(0,16).ToLower()
    $state = if ($hash -eq $m.h) { "MATCH" } else { "STALE" }
  }
  if ($inDl -and $state -ne "MATCH") { $state = "PENDING" }

  [pscustomobject]@{
    File     = $m.n
    Folder   = $m.d
    State    = $state
    Expected = $m.b
    OnDisk   = $bytes
    InDownloads = $inDl
  }
}

$results | Sort-Object State, File | Format-Table -AutoSize

""
"SUMMARY"
$results | Group-Object State | ForEach-Object { "  {0,-8} {1}" -f $_.Name, $_.Count }

$todo = $results | Where-Object { $_.State -ne "MATCH" }
if ($todo) {
  ""
  "NOT UP TO DATE:"
  $todo | ForEach-Object { "  {0,-30} {1}" -f $_.File, $_.State }
  ""
  "Files still in Downloads can be installed with:"
  $todo | Where-Object { $_.InDownloads } | ForEach-Object {
    '  Move-Item -Force "$HOME\Downloads\{0}" "{1}\{2}\{0}"' -f $_.File, $root, $_.Folder.Replace("/","\")
  }
} else {
  ""
  "Everything is current."
}
