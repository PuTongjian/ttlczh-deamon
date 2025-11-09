echo off

echo 准备关闭守护进程。。。

rem sc delete tup_service_d
::sc delete tup_service_d
net stop /f /t /im CloudLinkKitDaemon.exe
net stop /f /t /im CloudLinkKitService.exe
net stop /f /t /im tsdk_attach_agent.exe

echo 关闭完成，准备退出。。。  
pause 