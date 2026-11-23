[Setup]
SetupIconFile={#Icon}
UninstallDisplayIcon={app}\TAH.exe
AppId=TAH-{#Portal}-Live
AppName=TAH {#Portal} Live
AppVersion={#Version}
CloseApplications=yes
RestartApplications=no
DefaultDirName={localappdata}\TAH\{#Portal}
PrivilegesRequired=lowest
OutputDir={#Output}
OutputBaseFilename=TAH-{#Portal}-Windows-Live-Setup
Compression=lzma2
SolidCompression=yes
[Files]
Source: "{#Publish}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
[Icons]
Name: "{autoprograms}\TAH {#Portal} Live"; Filename: "{app}\TAH.exe"
[Run]
Filename: "{app}\TAH.exe"; Description: "Open TAH {#Portal} Live"; Flags: nowait postinstall
