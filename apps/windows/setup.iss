[Setup]
AppId=TAH-{#Portal}-Preview
AppName=TAH {#Portal} Preview
AppVersion=1.0
DefaultDirName={localappdata}\TAH\{#Portal}
PrivilegesRequired=lowest
OutputDir={#Output}
OutputBaseFilename=TAH-{#Portal}-Windows-Preview-Setup
Compression=lzma2
SolidCompression=yes
[Files]
Source: "{#Publish}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
[Icons]
Name: "{autoprograms}\TAH {#Portal} Preview"; Filename: "{app}\TAH.exe"
[Run]
Filename: "{app}\TAH.exe"; Description: "Open TAH {#Portal} Preview"; Flags: nowait postinstall skipifsilent
