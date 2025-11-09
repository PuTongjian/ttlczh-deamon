echo off

set start_service=1
set resource_path=%appdata%\CloudLinkKitDaemon
set log_path=%appdata%\terminal_sdk_log
set paths=%~dp0

if %start_service%==0 (
	echo tup_service_bat is not allow to create service
	goto END
)

if NOT EXIST %resource_path% (
	mkdir %resource_path%
)
::创建日志文件夹
mkdir .\terminal_sdk_log

echo 准备启动守护进程。。。
start "" "%paths%\CloudLinkKitDaemon.exe" --openSsl --resourcePath="%appdata%\resources/" --logPath=".\terminal_sdk_log/" --certFile="%paths%server.pem" --keyFile="%paths%server.key" --wsMainPort=7684 --wsSparePort=7682
echo 启动完毕，准备退出。。。  
pause 
