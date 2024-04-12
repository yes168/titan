#!/bin/bash

# 固定身份码
id="E221E36F-ACC0-4611-B947-99C1FC512A8B"

# 固定节点数量
container_count=5

# 固定存储空间大小
storage_gb=1

# 固定节点存储数据的宿主机路径
custom_storage_path="titan_storage"

apt update

# 检查 Docker 是否已安装
if ! command -v docker &> /dev/null
then
    echo "未检测到 Docker，正在安装..."
    apt-get install ca-certificates curl gnupg lsb-release -y
    
    # 安装 Docker 最新版本
    apt-get install docker.io -y
else
    echo "Docker 已安装。"
fi

# 拉取Docker镜像
docker pull nezha123/titan-edge:1.4

# 创建固定数量的容器
for i in $(seq 1 $container_count)
do
    # 判断用户是否输入了自定义存储路径
    if [ -z "$custom_storage_path" ]; then
        # 用户未输入，使用默认路径
        storage_path="$PWD/titan_storage_$i"
    else
        # 用户输入了自定义路径，使用用户提供的路径
        storage_path="$custom_storage_path"
    fi

    # 确保存储路径存在
    mkdir -p "$storage_path"

    # 运行容器，并设置重启策略为always
    container_id=$(docker run -d --restart always -v "$storage_path:/root/.titanedge/storage" --name "titan$i" nezha123/titan-edge:1.4)

    echo "节点 titan$i 已经启动 容器ID $container_id"

    sleep 30

    # 修改宿主机上的config.toml文件以设置StorageGB值
    docker exec $container_id bash -c "\
        sed -i 's/^[[:space:]]*#StorageGB = .*/StorageGB = $storage_gb/' /root/.titanedge/config.toml && \
        echo '容器 titan'$i' 的存储空间已设置为 $storage_gb GB'"
   
    # 进入容器并执行绑定和其他命令
    docker exec $container_id bash -c "\
        titan-edge bind --hash=$id https://api-test1.container1.titannet.io/api/v2/device/binding"
done

echo "==============================所有节点均已设置并启动===================================."
