#!/bin/bash

# 定义日志文件路径和成功计数器
log_file="mint_log.txt"
success_count=0

# 初始日志
echo "Minting Script Started at $(date)" | tee -a $log_file

# 无限循环，持续检查费率并执行 Mint
while true; do
    # 获取当前手续费率
    feeRate=$(curl -s 'https://explorer.unisat.io/fractal-mainnet/api/bitcoin-info/fee' | jq -r '.data.fastestFee')

    # 输出当前手续费率并记录日志
    echo "当前费率为 $feeRate，准备进行 Mint" | tee -a $log_file

    # 如果手续费率大于 1000，跳过当前循环
    if [ "$feeRate" -gt 2000 ]; then
        echo "费率超过 2000，跳过当前循环" | tee -a $log_file
        sleep 5
        continue
    fi

    # 构建 Mint 命令
    command="yarn cli mint -i 45ee725c2c5993b3e4d308842d87e973bf1951f57a804b21e4dd964ecd12d6b_0 5 --fee-rate $feeRate"
    
    # 执行 Mint 命令
    $command
    command_status=$?

    # 根据命令执行结果进行判断
    if [ $command_status -ne 0 ]; then
        echo "Mint 命令执行失败，退出脚本" | tee -a $log_file
        exit 1
    else
        success_count=$((success_count + 1))
        echo "Mint 成功进行 $success_count 次" | tee -a $log_file
    fi

    # 等待 10 秒后重新开始
    sleep 10
done
